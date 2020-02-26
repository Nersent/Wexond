import { Menu, webContents } from 'electron';
import { defaultTabOptions } from '~/constants/tabs';
import { WindowsManager } from '../windows-manager';
import { viewSource, saveAs, printPage } from './common-actions';
import { WEBUI_BASE_URL, WEBUI_URL_SUFFIX } from '~/constants/files';

const createShortcutMenuItem = (
  shortcuts: string[],
  label: string,
  action: (shortcutIndex?: number) => void,
) =>
  shortcuts.map((shortcut, key) => ({
    accelerator: shortcut,
    label,
    visible: false,
    click: () => action(key),
  }));

export const getMainMenu = (windowsManager: WindowsManager) => {
  const template: any = [
    {
      submenu: [
        {
          role: 'quit',
          accelerator: 'CmdOrCtrl+Shift+Q',
        },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          accelerator: 'CmdOrCtrl+T',
          label: 'New tab',
          click() {
            windowsManager.currentWindow.viewManager.create(defaultTabOptions);
          },
        },
        {
          accelerator: 'CmdOrCtrl+N',
          label: 'New window',
          click() {
            windowsManager.createWindow();
          },
        },
        {
          accelerator: 'CmdOrCtrl+Shift+N',
          label: 'New incognito window',
          click() {
            windowsManager.createWindow(true);
          },
        },
        {
          type: 'separator',
        },
        {
          accelerator: 'CmdOrCtrl+W',
          label: 'Close tab',
          click() {
            windowsManager.currentWindow.webContents.send(
              'remove-tab',
              windowsManager.currentWindow.viewManager.selectedId,
            );
          },
        },
        {
          accelerator: 'CmdOrCtrl+Shift+W',
          label: 'Close current window',
          click() {
            windowsManager.currentWindow.close();
          },
        },
        {
          type: 'separator',
        },
        ...createShortcutMenuItem(
          ['CmdOrCtrl+Shift+R', 'Shift+F5'],
          'Reload ignoring cache',
          () => {
            windowsManager.currentWindow.viewManager.selected.webContents.reload();
          },
        ),
        ...createShortcutMenuItem(['CmdOrCtrl+F4'], 'Close tab', () => {
          windowsManager.currentWindow.webContents.send(
            'remove-tab',
            windowsManager.currentWindow.viewManager.selectedId,
          );
        }),
        ...createShortcutMenuItem(['CmdOrCtrl+R', 'F5'], 'Reload', () => {
          windowsManager.currentWindow.viewManager.selected.webContents.reload();
        }),
        ...createShortcutMenuItem(['CmdOrCtrl+F'], 'Find in page', () => {
          windowsManager.currentWindow.webContents.send('find');
        }),
        ...createShortcutMenuItem(['CmdOrCtrl+F4'], 'Close tab', () => {
          windowsManager.currentWindow.webContents.send(
            'remove-tab',
            windowsManager.currentWindow.viewManager.selectedId,
          );
        }),
        ...createShortcutMenuItem(
          ['CmdOrCtrl+Shift+T'],
          'Revert closed tab',
          () => {
            windowsManager.currentWindow.webContents.send('revert-closed-tab');
          },
        ),
        ...createShortcutMenuItem(
          ['CmdOrCtrl+Tab', 'CmdOrCtrl+PageDown'],
          'Select next tab',
          () => {
            windowsManager.currentWindow.webContents.send('select-next-tab');
          },
        ),
        ...createShortcutMenuItem(
          ['CmdOrCtrl+Shift+Tab', 'CmdOrCtrl+PageUp'],
          'Select previous tab',
          () => {
            windowsManager.currentWindow.webContents.send(
              'select-previous-tab',
            );
          },
        ),
        ...createShortcutMenuItem(
          ['Ctrl+Space', 'CmdOrCtrl+L', 'Alt+D', 'F6'],
          'Toggle search',
          () => {
            windowsManager.currentWindow.dialogs.searchDialog.show();
          },
        ),
        ...createShortcutMenuItem(['Alt+F', 'Alt+E'], 'Toggle menu', () => {
          windowsManager.currentWindow.dialogs.menuDialog.show();
        }),
        ...createShortcutMenuItem(
          ['CmdOrCtrl+Shift+F12'],
          'Toggle developer tools (window)',
          () => {
            setTimeout(() => {
              webContents
                .getFocusedWebContents()
                .openDevTools({ mode: 'detach' });
            });
          },
        ),
        ...createShortcutMenuItem(
          ['F12', 'Ctrl+Shift+I'],
          'Toggle developer tools (contents)',
          () => {
            setTimeout(() => {
              windowsManager.currentWindow.viewManager.selected.webContents.toggleDevTools();
            });
          },
        ),
        {
          label: 'View page source',
          accelerator: 'CmdOrCtrl+U',
          click: () => {
            viewSource();
          },
        },
        {
          label: 'Save as',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            saveAs();
          },
        },
        {
          label: 'Print',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            printPage();
          },
        },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [],
    },
    {
      label: 'History',
      submenu: [
        ...createShortcutMenuItem(['CmdOrCtrl+H'], 'Manage history', () => {
          windowsManager.currentWindow.viewManager.create({
            url: `${WEBUI_BASE_URL}history${WEBUI_URL_SUFFIX}`,
            active: true,
          });
        }),
        ...createShortcutMenuItem(['Alt+Left'], 'Go back', () => {
          const { selected } = windowsManager.currentWindow.viewManager;
          if (selected) {
            selected.webContents.goBack();
          }
        }),
        ...createShortcutMenuItem(['Alt+Right'], 'Go forward', () => {
          const { selected } = windowsManager.currentWindow.viewManager;
          if (selected) {
            selected.webContents.goForward();
          }
        }),
      ],
    },
    {
      label: 'Bookmarks',
      submenu: [
        ...createShortcutMenuItem(
          ['CmdOrCtrl+D'],
          'Add this website to bookmarks',
          () => {
            windowsManager.currentWindow.webContents.send(
              'show-add-bookmark-dialog',
            );
          },
        ),
        ...createShortcutMenuItem(
          ['CmdOrCtrl+Shift+O'],
          'Manage bookmarks',
          () => {
            windowsManager.currentWindow.viewManager.create({
              url: `${WEBUI_BASE_URL}bookmarks${WEBUI_URL_SUFFIX}`,
              active: true,
            });
          },
        ),
      ],
    },
  ];

  template[0].submenu = template[0].submenu.concat(
    createShortcutMenuItem(
      Array.from({ length: 8 }, (v, k) => k + 1).map(i => `CmdOrCtrl+${i}`),
      'Select tab index',
      i => {
        windowsManager.currentWindow.webContents.send('select-tab-index', i);
      },
    ),
  );

  template[0].submenu = template[0].submenu.concat(
    createShortcutMenuItem(['CmdOrCtrl+9'], 'Select last tab', () => {
      windowsManager.currentWindow.webContents.send('select-last-tab');
    }),
  );

  return Menu.buildFromTemplate(template);
};
