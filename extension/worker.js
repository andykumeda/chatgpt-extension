import { GlobalAccess } from './permissions.js';
import { registerPanels } from './connections.js';

registerPanels(chrome);

// An actual action handler grants activeTab; auto-opening the panel alone can skip it.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});
const access = new GlobalAccess(chrome);
void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
void access.reconcile().catch(() => {});
chrome.runtime.onStartup.addListener(() => { void access.reconcile().catch(() => {}); });
