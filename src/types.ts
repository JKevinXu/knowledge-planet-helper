/// <reference types="chrome"/>

// Shared types for the Knowledge Planet Helper extension

export interface PDFInfo {
  element: HTMLElement;
  fileName: string;
  downloadCount: number;
  uploadDate: string;
  index: number;
}

export interface DownloadMetadata {
  fileName: string;
  uploadDate: string;
  downloadCount: number;
}

export interface DownloadTask {
  pdfIndex: number;
  expectedFileName: string;
  downloadCount: number;
  retryCount?: number;
}

export interface StorageData {
  installed?: boolean;
  installDate?: string;
  downloadedPDFs?: DownloadRecord[];
  downloadStats?: Record<string, number>;
  pdfViews?: Record<string, PDFViewRecord>;
}

export interface DownloadRecord {
  fileName: string;
  url: string;
  downloadCount: number;
  downloadedAt: string;
  method: string;
}

export interface PDFViewRecord {
  fileName: string;
  lastViewed: string;
  actualDownloadCount: number;
  url: string;
}

export interface ScanProgress {
  action: 'scanProgress';
  type: 'start' | 'progress' | 'complete';
  total: number;
  scanned: number;
  eligible: number;
  pdfs: PDFInfo[];
  currentPdf?: PDFInfo;
}

export interface MessageRequest {
  action: string;
  [key: string]: any;
}

export interface MessageResponse {
  success: boolean;
  message: string;
  [key: string]: any;
}

// Constants
export const CONSTANTS = {
  MIN_DOWNLOAD_COUNT: 5,
  DOWNLOAD_DELAY: 3000,
  MAX_RETRIES: 2,
  MODAL_TIMEOUT: 10000,
  CLEANUP_INTERVAL: 60000,
  BATCH_DELAY: 2000,
} as const;