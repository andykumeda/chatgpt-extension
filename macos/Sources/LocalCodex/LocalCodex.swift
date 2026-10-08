import SwiftUI
import AppKit
import Sparkle
import Darwin

struct SetupStatus: Decodable {
    var codexPath: String?
    var codexHome: String?
    var authenticated: Bool?
    var busy: Bool?
    var registered: Bool?
    var appInstalled: Bool?
    var chromeWebStoreUrl: String?
    var error: String?
}

enum BridgeActivity {
    static func isBusy() -> Bool {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let config = home.appendingPathComponent("Library/Application Support/Local Codex/host-config.json")
        var state = home.appendingPathComponent(".codex/local-sidepanel")
        if FileManager.default.fileExists(atPath: config.path) {
            guard let data = try? Data(contentsOf: config),
                  let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let root = value["state"] as? String, root.hasPrefix("/") else { return true }
            state = URL(fileURLWithPath: root)
        }
        let lock = state.appendingPathComponent("bridge.lock")
        guard FileManager.default.fileExists(atPath: lock.path) else { return false }
        guard let text = try? String(contentsOf: lock, encoding: .utf8),
              let pid = Int32(text.trimmingCharacters(in: .whitespacesAndNewlines)), pid > 0 else { return true }
        return kill(pid, 0) == 0 || errno != ESRCH
    }
}

@MainActor
final class Updates: NSObject, ObservableObject, SPUUpdaterDelegate {
    @Published var enabled = false
    @Published var notice = "Automatic updates will be available after the first published release."
    private var controller: SPUStandardUpdaterController?
    private var resumeTimer: Timer?

    override init() {
        super.init()
        let info = Bundle.main.infoDictionary ?? [:]
        guard let feed = info["SUFeedURL"] as? String,
              let url = URL(string: feed), url.scheme == "https", url.host != nil,
              let key = info["SUPublicEDKey"] as? String,
              Data(base64Encoded: key)?.count == 32,
              Bundle.main.bundleURL.standardizedFileURL == FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications/Local Codex.app").standardizedFileURL else { return }
        let controller = SPUStandardUpdaterController(startingUpdater: false, updaterDelegate: self, userDriverDelegate: nil)
        self.controller = controller
        // Downloading is safe while the bridge runs; installation always waits for it to close.
        controller.updater.automaticallyDownloadsUpdates = false
        controller.startUpdater()
        enabled = true
        notice = "Updates are checked automatically. Close the Chrome panel before installing an update."
    }

    func check() { controller?.checkForUpdates(nil) }

    func updater(_ updater: SPUUpdater, shouldPostponeRelaunchForUpdate item: SUAppcastItem, untilInvokingBlock installHandler: @escaping () -> Void) -> Bool {
        guard BridgeActivity.isBusy() else { return false }
        notice = "Update ready. Close the Chrome side panel to finish installing."
        resumeTimer?.invalidate()
        resumeTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] timer in
            Task { @MainActor in
                if !BridgeActivity.isBusy() {
                    timer.invalidate()
                    self?.resumeTimer = nil
                    installHandler()
                }
            }
        }
        return true
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard BridgeActivity.isBusy() else { return .terminateNow }
        let alert = NSAlert()
        alert.messageText = "Close the Chrome side panel first"
        alert.informativeText = "The local bridge is running. Close the panel, then quit or install the update."
        alert.addButton(withTitle: "Keep Open")
        alert.runModal()
        return .terminateCancel
    }
}

@MainActor
final class Setup: ObservableObject {
    @Published var status: SetupStatus?
    @Published var working = false
    @Published var message = "Checking your setup…"
    @Published var codexPath: String = ""

    private var installedApp: URL { FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications/Local Codex.app") }
    var shouldOpenInstalled: Bool { status?.appInstalled == true && Bundle.main.bundleURL.standardizedFileURL != installedApp.standardizedFileURL }

    func openInstalledApp() {
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.createsNewApplicationInstance = true
        NSWorkspace.shared.openApplication(at: installedApp, configuration: configuration) { _, error in
            Task { @MainActor in
                self.message = error == nil ? "The installed app is open. You can close this setup window." : "Could not open the installed app. Open ~/Applications/Local Codex.app in Finder."
            }
        }
    }

    func run(_ command: String, copy: Bool = false) {
        guard !working else { return }
        working = true
        let selectedPath = codexPath
        let bundle = Bundle.main.bundleURL
        Task {
            do {
                let value = try await Task.detached { () throws -> SetupStatus in
                    let resources = bundle.appendingPathComponent("Contents/Resources")
                    let process = Process()
                    process.executableURL = resources.appendingPathComponent("runtime/node")
                    var args = [resources.appendingPathComponent("companion/setup.mjs").path, command, "--json"]
                    if !selectedPath.isEmpty { args += ["--codex", selectedPath] }
                    if copy { args += ["--copy-app"] }
                    process.arguments = args
                    let pipe = Pipe()
                    process.standardOutput = pipe
                    process.standardError = FileHandle.nullDevice
                    try process.run()
                    let data = pipe.fileHandleForReading.readDataToEndOfFile()
                    process.waitUntilExit()
                    return try JSONDecoder().decode(SetupStatus.self, from: data)
                }.value
                status = value
                message = value.error ?? (command == "install" ? (shouldOpenInstalled ? "Installed and connected. Click Open installed app to use the copy in Applications and receive future updates." : "Installed and connected to Chrome. Your chats and workspaces are preserved.") : "Setup status refreshed.")
            } catch { message = "Setup could not run. Open the packaged Local Codex app and try again." }
            working = false
        }
    }

    func chooseCodex() {
        let panel = NSOpenPanel()
        panel.message = "Choose the Codex command-line executable"
        panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url { codexPath = url.path; run("status") }
    }

    func signIn() {
        guard let binary = status?.codexPath, let codexHome = status?.codexHome else { return }
        let quote: (String) -> String = { "'" + $0.replacingOccurrences(of: "'", with: "'\\''") + "'" }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("LocalCodex-login-\(UUID().uuidString)")
        let script = directory.appendingPathComponent("Sign in to Codex.command")
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let contents = "#!/bin/sh\ntrap 'rm -f -- \"$0\"; rmdir -- \"$(dirname -- \"$0\")\"' EXIT\nexport CODEX_HOME=\(quote(codexHome))\n\(quote(binary)) login\n"
            try contents.write(to: script, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: script.path)
            NSWorkspace.shared.open([script], withApplicationAt: URL(fileURLWithPath: "/System/Applications/Utilities/Terminal.app"), configuration: NSWorkspace.OpenConfiguration())
            message = "Complete sign-in in Terminal, then click Refresh."
        } catch { message = "Could not open the sign-in command. Run codex login in Terminal, then refresh." }
    }
}

@main
struct LocalCodexApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var setup = Setup()
    @StateObject private var updates = Updates()

    var body: some Scene {
        WindowGroup("Local Codex") {
            VStack(alignment: .leading, spacing: 20) {
                Label("Local Codex", systemImage: "bubble.left.and.bubble.right.fill").font(.largeTitle.bold())
                Text("Connect Chrome to Codex on this Mac.").font(.title3).foregroundStyle(.secondary)
                Divider()
                row("1. Codex", detail: setup.status?.codexPath == nil ? "Install the Codex CLI, then refresh or choose its executable." : "Codex is available on this Mac.", done: setup.status?.codexPath != nil) {
                    if setup.status?.codexPath == nil {
                        Button("Get Codex") { NSWorkspace.shared.open(URL(string: "https://developers.openai.com/codex/cli/")!) }
                    }
                    Button("Choose executable…") { setup.chooseCodex() }
                }
                row("2. Sign in", detail: setup.status?.authenticated == true ? "Signed in to your Codex account." : "Use your own account. Sign-in stays with Codex.", done: setup.status?.authenticated == true) {
                    Button("Sign in with Codex") { setup.signIn() }.disabled(setup.status?.codexPath == nil)
                }
                row("3. Install and connect", detail: setup.status?.registered == true ? "Chrome uses the app in ~/Applications." : "Install in ~/Applications and register the local Chrome connection.", done: setup.status?.registered == true) {
                    Button("Install and connect Chrome") { setup.run("install", copy: true) }
                        .disabled(setup.status?.codexPath == nil || setup.status?.busy == true)
                    if setup.shouldOpenInstalled { Button("Open installed app") { setup.openInstalledApp() } }
                }
                row("4. Add the extension", detail: setup.status?.chromeWebStoreUrl == nil ? "The Chrome Web Store listing is awaiting publication." : "Install the extension from the Chrome Web Store.", done: false) {
                    Button("Open Chrome Web Store") {
                        if let value = setup.status?.chromeWebStoreUrl, let url = URL(string: value), url.scheme == "https" { NSWorkspace.shared.open(url) }
                    }.disabled(setup.status?.chromeWebStoreUrl == nil)
                }
                Divider()
                Text(setup.status?.busy == true ? "The Chrome bridge is running. Close the side panel before installing." : setup.message)
                    .font(.callout).textSelection(.enabled)
                Text(updates.notice).font(.callout).foregroundStyle(.secondary)
                HStack {
                    Button("Refresh") { setup.run("status") }
                    Button("Check for Updates…") { updates.check() }.disabled(!updates.enabled)
                    if setup.working { ProgressView().controlSize(.small) }
                }
            }
            .padding(28).frame(width: 620).disabled(setup.working)
            .task { setup.run("status") }
        }
        .windowResizability(.contentSize)
    }

    private func row<Actions: View>(_ title: String, detail: String, done: Bool, @ViewBuilder actions: () -> Actions) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: done ? "checkmark.circle.fill" : "circle").font(.headline)
            Text(detail).font(.callout).foregroundStyle(.secondary)
            HStack { actions() }
        }
    }
}
