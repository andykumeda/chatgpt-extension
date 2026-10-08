# Local Codex privacy policy draft

Local Codex is an independent Chrome extension and Mac companion app. It connects Chrome's side panel to your local Codex installation. It is not affiliated with OpenAI.

When you send a message, Local Codex automatically captures the active webpage's URL, title, visible page text and selected text, subject to Chrome site permission and size limits. Your message and this page context are passed to your local Codex setup and its configured model provider. Do not send page content you do not want that provider to receive. Its own privacy and retention terms apply.

Chats, messages, page attachments and workspace references are saved locally under ~/.codex/local-sidepanel. Local Codex does not operate a chat-storage server. Codex authentication remains managed by Codex; the extension does not receive your authentication credentials. Your local Codex runtime and model provider may maintain their own records.

Local Codex can read files in your chosen workspace through Codex. Workspace writes require enabling workspace edits for that message. Optional live browser access is scoped to the selected tab; browser actions require confirmation. The extension requests site access only through Chrome's permission interface. Captured page content is used as context for the user's task.

This build contains no analytics or advertising integration. Future companion update checks, when configured and enabled, contact the configured update server, which may receive ordinary network information such as IP address. Update hosting and any server retention policy must be documented here before activating public updates.

To remove local chat history, first close Local Codex panels and preserve anything you need, then delete ~/.codex/local-sidepanel. Removing the extension or app does not automatically remove that history or Codex's own data.

Before publication: replace this notice with the publisher's identity, privacy contact, effective date, production download/update-host details, and any applicable provider links. This draft is not yet a published privacy policy.
