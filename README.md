# Knowledge Planet Helper - Chrome Extension

A Chrome extension that helps with downloading PDFs from Knowledge Planet and displays hello world messages.

## 🚀 Features

- **Hello World Messages**: Displays friendly hello messages in multiple ways:
  - Popup interface with interactive button
  - Floating notification on Knowledge Planet pages
  - Console logging for debugging
  - Chrome storage integration

- **PDF Download Helper**: Ready to be extended for automatic PDF downloads from Knowledge Planet

## 📦 Installation

### Step 1: Build the Extension
```bash
npm install
npm run build
```

### Step 2: Create Icons
You need to create icon files in the `icons/` directory:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

See `CREATE_ICONS.md` for detailed instructions.

### Step 3: Load in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `knowledge-planet-helper` folder
5. The extension should now appear in your extensions list

## 🎯 Usage

### Hello World Features:
1. **Popup Interface**: Click the extension icon in the toolbar to open the popup with a "Say Hello" button
2. **Page Notifications**: Visit any Knowledge Planet page (wx.zsxq.com) to see a floating hello message
3. **Console Messages**: Check the browser console for hello world messages
4. **Storage**: The extension remembers your last hello message

### Testing:
- Click the extension icon to open the popup
- Click "Say Hello" to see random hello messages
- Visit `https://wx.zsxq.com/group/*` to see content script in action
- Check browser console (F12) for background script messages

## 🛠️ Development

### Available Scripts:
- `npm run build` - Build for production
- `npm run dev` - Build and watch for changes
- `npm run clean` - Clean the dist folder

### File Structure:
```
knowledge-planet-helper/
├── src/
│   ├── popup.ts      # Popup interface logic
│   ├── background.ts # Background service worker
│   └── content.ts    # Content script for web pages
├── dist/             # Built files (generated)
├── icons/            # Extension icons (you need to create these)
├── popup.html        # Popup HTML interface
├── manifest.json     # Extension configuration
└── package.json      # Dependencies
```

## 🔧 Extension Components

### Popup (`popup.html` + `src/popup.ts`)
- Interactive interface with hello world button
- Displays random hello messages
- Stores messages in chrome.storage

### Background Script (`src/background.ts`)
- Service worker that runs in the background
- Handles extension lifecycle events
- Processes messages from other components

### Content Script (`src/content.ts`)
- Runs on Knowledge Planet pages
- Shows floating hello notifications
- Communicates with background script

## 📝 Next Steps

This hello world extension is ready to be extended with:
- PDF detection and download functionality
- User preferences and settings
- Advanced UI components
- Data persistence and sync

## 🐛 Troubleshooting

- **Icons not showing**: Make sure you have created the icon files in the `icons/` directory
- **Extension not loading**: Check that you've built the project with `npm run build`
- **Hello messages not appearing**: Check the browser console for any JavaScript errors
- **Content script not working**: Make sure you're visiting a Knowledge Planet page (wx.zsxq.com)

Happy coding! 🎉 