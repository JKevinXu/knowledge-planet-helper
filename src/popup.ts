/// <reference types="chrome"/>

document.addEventListener('DOMContentLoaded', function() {
  const scanPDFsButton = document.getElementById('scanPDFs') as HTMLButtonElement;
  const messageDiv = document.getElementById('message') as HTMLDivElement;

  // Load and display download statistics
  loadDownloadStats();

  // Scan PDFs button functionality
  scanPDFsButton.addEventListener('click', function() {
    // Send message to active tab to scan for PDFs
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id && tabs[0].url?.includes('wx.zsxq.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'scanPDFs' }, (response) => {
          if (response) {
            messageDiv.innerHTML = '<div style="color: #4CAF50; font-size: 11px;">✅ Page scanned for PDFs</div>';
          } else {
            messageDiv.innerHTML = '<div style="color: #ff9800; font-size: 11px;">⚠️ Make sure you\'re on a Knowledge Planet page</div>';
          }
        });
      } else {
        messageDiv.innerHTML = '<div style="color: #f44336; font-size: 11px;">❌ Please visit a Knowledge Planet page first</div>';
      }
    });
  });

  // Load download statistics
  async function loadDownloadStats() {
    try {
      const result = await chrome.storage.local.get(['downloadStats', 'downloadedPDFs']);
      const downloadStats = result.downloadStats || {};
      const downloadedPDFs = result.downloadedPDFs || [];
      
      // Create download stats display
      const statsHtml = createStatsDisplay(downloadStats, downloadedPDFs);
      
      // Add stats to the popup
      const existingStats = document.getElementById('download-stats');
      if (existingStats) {
        existingStats.remove();
      }
      
      const statsDiv = document.createElement('div');
      statsDiv.id = 'download-stats';
      statsDiv.innerHTML = statsHtml;
      
      const container = document.querySelector('.content');
      if (container) {
        container.appendChild(statsDiv);
      }
      
    } catch (error) {
      console.error('Error loading download stats:', error);
    }
  }

  function createStatsDisplay(downloadStats: any, downloadedPDFs: any[]): string {
    const totalTracked = Object.keys(downloadStats).length;
    const totalDownloaded = downloadedPDFs.length;
    
    let statsHtml = `
      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2);">
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 10px;">📊 PDF Statistics</div>
        <div style="font-size: 11px; opacity: 0.9; margin-bottom: 5px;">
          📄 PDFs Tracked: ${totalTracked}
        </div>
        <div style="font-size: 11px; opacity: 0.9; margin-bottom: 10px;">
          ⬇️ Downloaded: ${totalDownloaded}
        </div>
    `;
    
    if (totalTracked > 0) {
      statsHtml += `<div style="font-size: 10px; opacity: 0.8; margin-bottom: 10px;">Recent Activity:</div>`;
      
      // Show top 5 most requested PDFs
      const sortedPDFs = Object.entries(downloadStats)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 5);
      
      sortedPDFs.forEach(([pdfName, count]) => {
        const isDownloaded = downloadedPDFs.some(pdf => pdf.fileName.toLowerCase() === pdfName);
        const status = isDownloaded ? '✅' : (count as number) >= 5 ? '🟡' : '⏳';
        const shortName = pdfName.length > 25 ? pdfName.substring(0, 25) + '...' : pdfName;
        
        statsHtml += `
          <div style="font-size: 9px; opacity: 0.7; margin: 3px 0; display: flex; justify-content: space-between;">
            <span title="${pdfName}">${status} ${shortName}</span>
            <span>${count}/5</span>
          </div>
        `;
      });
    } else {
      statsHtml += `
        <div style="font-size: 10px; opacity: 0.6; text-align: center; padding: 20px;">
          No PDFs tracked yet.<br>
          Visit Knowledge Planet pages to start detecting PDFs!
        </div>
      `;
    }
    
    if (totalDownloaded > 0) {
      statsHtml += `
        <button id="view-downloads" style="
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          color: white;
          padding: 5px 10px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 10px;
          margin-top: 8px;
          width: 100%;
        ">📂 View Download History</button>
      `;
    }
    
    statsHtml += `</div>`;
    
    return statsHtml;
  }

  // Add event listener for view downloads button (dynamically added)
  document.addEventListener('click', function(e) {
    if ((e.target as HTMLElement).id === 'view-downloads') {
      showDownloadHistory();
    }
  });

  async function showDownloadHistory() {
    try {
      const result = await chrome.storage.local.get(['downloadedPDFs']);
      const downloadedPDFs = result.downloadedPDFs || [];
      
      if (downloadedPDFs.length === 0) {
        messageDiv.innerHTML = '<div style="color: #fff; font-size: 11px;">No downloads yet!</div>';
        return;
      }
      
      // Create download history popup
      const historyHtml = `
        <div style="
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.8);
          z-index: 1000;
          display: flex;
          justify-content: center;
          align-items: center;
        " id="download-history-overlay">
          <div style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            max-width: 350px;
            max-height: 400px;
            overflow-y: auto;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <strong>📄 Download History</strong>
              <button id="close-history" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 12px;
              ">×</button>
            </div>
            ${downloadedPDFs.map((pdf: any) => `
              <div style="
                padding: 10px;
                margin: 8px 0;
                background: rgba(255,255,255,0.1);
                border-radius: 5px;
                font-size: 11px;
              ">
                <div style="font-weight: bold; margin-bottom: 5px;">${pdf.fileName}</div>
                <div style="opacity: 0.8; font-size: 9px;">
                  Downloads: ${pdf.downloadCount} | ${new Date(pdf.downloadedAt).toLocaleDateString()}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', historyHtml);
      
      // Add close button listener
      document.getElementById('close-history')?.addEventListener('click', () => {
        document.getElementById('download-history-overlay')?.remove();
      });
      
    } catch (error) {
      console.error('Error showing download history:', error);
    }
  }

  // Refresh stats every few seconds
  setInterval(loadDownloadStats, 5000);
}); 