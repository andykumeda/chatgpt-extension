# Permission and data-use disclosure draft

Single purpose: provide a local Codex chat beside the current webpage with page context for the user's task.

| Permission | Purpose |
| --- | --- |
| sidePanel | Show the chat interface in Chrome's side panel. |
| nativeMessaging | Connect only to the registered Local Codex bridge on the user's Mac. |
| activeTab | Access the user-invoked current tab to identify/capture context. |
| scripting | Capture visible page content and support optional approved browser interactions. |
| Optional http://*/* and https://*/* site access | Let the user grant access to sites whose page content is attached automatically. Also supports explicitly enabled browser access on that site. These are optional host permissions rather than blanket access on install. |

Data used: messages, page URLs/titles/text/selections, local chat history and workspace paths. Optional browser snapshots/results can contain webpage content. Text entered through an approved browser fill action is also processed for that action. Authentication is handled by Codex; Local Codex does not request password/payment field interaction. Avoid claiming that no personal data is processed: user messages and webpages may contain it.

Data flow: Chrome → local native bridge → local Codex → configured model provider. Chat history remains on the Mac; model-provider handling is governed by that provider. No advertising, analytics, or sale of data is implemented in this build. There is no remotely fetched extension executable code.

Complete Web Store data-use fields from the submitted build and hosted privacy policy. Check the categories for website content, browsing activity and user-provided communications as applicable; describe limited task-related use. Verify all declarations, product screenshots, developer identity, and the final extension ID before submission.
