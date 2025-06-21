/// <reference types="chrome"/>

// Content script for Knowledge Planet Helper
console.log('Hello World from Content Script! 🎯');

// Function to show hello message on the page
function showHelloMessage() {
  // Create a floating hello message
  const helloDiv = document.createElement('div');
  helloDiv.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 20px;
      border-radius: 10px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      cursor: pointer;
      transition: all 0.3s ease;
      max-width: 300px;
    " id="kp-hello-message">
      <strong>Hello World! 🌍</strong><br>
      Knowledge Planet Helper is active!
      <div style="margin-top: 8px; font-size: 12px; opacity: 0.8;">
        Click to dismiss
      </div>
    </div>
  `;
  
  document.body.appendChild(helloDiv);
  
  // Add click to dismiss
  const messageElement = document.getElementById('kp-hello-message');
  if (messageElement) {
    messageElement.addEventListener('click', () => {
      messageElement.style.transform = 'translateX(100%)';
      setTimeout(() => {
        messageElement.remove();
      }, 300);
    });
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      if (messageElement.parentNode) {
        messageElement.style.transform = 'translateX(100%)';
        setTimeout(() => {
          messageElement.remove();
        }, 300);
      }
    }, 5000);
  }
}

// Show hello message when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', showHelloMessage);
} else {
  showHelloMessage();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showHello') {
    showHelloMessage();
    sendResponse({ status: 'Hello message shown!' });
  }
});

// Send hello message to background script
chrome.runtime.sendMessage({ 
  action: 'sayHello', 
  message: 'Hello from content script!' 
}); 