const API_URL = 'http://localhost:3000/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  async request(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      ...options,
      headers,
    };

    const response = await fetch(url, config);

    // If it's a file attachment or requested blob, return raw response for Blob extraction
    const contentDisposition = response.headers.get('Content-Disposition');
    if (options.responseType === 'blob' || (contentDisposition && contentDisposition.includes('attachment')) || endpoint.includes('/download/')) {
      if (!response.ok) {
        throw new Error('File download failed');
      }
      return response;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'An API error occurred');
    }

    return data;
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Upload file using FormData with chunked streaming progress updates from server
   */
  async upload(endpoint, formData, onProgress) {
    const url = `${API_URL}${endpoint}`;
    const headers = {};
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'Upload failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastResult = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the last incomplete line

      for (const line of lines) {
        if (line.trim()) {
          const event = JSON.parse(line);
          if (event.status === 'uploading') {
            if (onProgress) onProgress(event);
          } else if (event.status === 'success') {
            lastResult = event.file;
          } else if (event.status === 'error') {
            throw new Error(event.message || 'Upload failed');
          }
        }
      }
    }

    return lastResult;
  }

  /**
   * Delete file using streaming progress updates from server
   */
  async deleteStream(endpoint, onProgress) {
    const url = `${API_URL}${endpoint}`;
    const headers = {};
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'Delete failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastResult = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.trim()) {
          const event = JSON.parse(line);
          if (event.status === 'deleting') {
            if (onProgress) onProgress(event);
          } else if (event.status === 'success') {
            lastResult = event.message;
          } else if (event.status === 'error') {
            throw new Error(event.message || 'Delete failed');
          }
        }
      }
    }

    return lastResult;
  }

  /**
   * Download file using streaming progress updates from server
   */
  async downloadStream(endpoint, onProgress) {
    const url = `${API_URL}${endpoint}`;
    const headers = {};
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'Download failed');
    }

    const contentLengthHeader = response.headers.get('Content-Length');
    const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
    
    const reader = response.body.getReader();
    const chunks = [];
    let loadedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loadedBytes += value.length;

      if (onProgress && totalBytes > 0) {
        onProgress({
          loadedBytes,
          totalBytes,
        });
      }
    }

    return new Blob(chunks);
  }
}

export const api = new ApiClient();
export default api;
