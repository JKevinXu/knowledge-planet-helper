/// <reference types="chrome"/>

document.addEventListener('DOMContentLoaded', function() {
  const sayHelloButton = document.getElementById('sayHello') as HTMLButtonElement;
  const messageDiv = document.getElementById('message') as HTMLDivElement;

  sayHelloButton.addEventListener('click', function() {
    const messages = [
      'Hello from your Chrome extension! 👋',
      'Welcome to Knowledge Planet Helper! 🚀',
      'Extension is working perfectly! ✨',
      'Ready to help you download PDFs! 📄',
      'Chrome extension says hi! 🎉'
    ];
    
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    messageDiv.textContent = randomMessage;
    
    // Optional: Show a console message
    console.log('Hello World from Knowledge Planet Helper!');
    
    // Optional: Store a message in chrome storage
    chrome.storage.local.set({
      lastMessage: randomMessage,
      timestamp: new Date().toISOString()
    });
  });

  // Load and display the last message if it exists
  chrome.storage.local.get(['lastMessage'], function(result) {
    if (result.lastMessage) {
      messageDiv.textContent = `Last: ${result.lastMessage}`;
    }
  });
}); 