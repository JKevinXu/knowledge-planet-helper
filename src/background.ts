/// <reference types="chrome"/>

// Background script for Knowledge Planet Helper
console.log('Hello World from Background Script! 🌟');

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details);
  
  // Set up initial storage
  chrome.storage.local.set({
    installed: true,
    installDate: new Date().toISOString(),
    helloMessage: 'Hello World from Knowledge Planet Helper!'
  });
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in background:', request);
  
  if (request.action === 'sayHello') {
    console.log('Hello World message received!');
    sendResponse({ message: 'Hello back from background script!' });
  }
  
  return true; // Keep the message channel open for async responses
});

// Optional: Listen for tab updates to show hello message
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('wx.zsxq.com')) {
    console.log('Hello World! Knowledge Planet page loaded:', tab.url);
  }
}); 