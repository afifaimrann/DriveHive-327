// lib/api.ts

/**
 * Basic file metadata as stored in backend.
 * will adjust with backend when it returns more/different fields.
 */
export interface FileMetadata {
  name: string;
  size: number;
  mimeType: string;
  isChunked: boolean;
  chunks: any[]; // will replace 'any[]' with a more specific type if you know the chunk structure
}

/**
 * The response your /upload endpoint returns.
 * Example shape (based on your backend code):
 * {
 *   "message": "File uploaded successfully",
 *   "metadata": {
 *     "name": "example.jpg",
 *     "size": 12345,
 *     "mimeType": "image/jpeg",
 *     "isChunked": false,
 *     "chunks": []
 *     "uploadedAt": "2025-02-20T00:00:00.000Z"
 *   }
 * }
 */
export interface UploadResponse {
  message: string;
  metadata: FileMetadata & {
    uploadedAt: string; // or Date, if you parse it
  };
}

/**
 * The response my /files endpoint returns.
 * Example shape (based on backend code):
 * {
 *   "files": ["file1.jpg", "file2.png"]
 * }
 */
export interface GetFilesResponse {
  files: string[];
}

/**
 * The response my /delete endpoint returns.
 * Example shape (based on backend code):
 * {
 *   "message": "File deleted successfully",
 *   "fileName": "example.jpg",
 *   "chunksDeleted": 0
 * }
 */
export interface DeleteResponse {
  message: string;
  fileName: string;
  chunksDeleted: number;
}

/* ------------------------------------------------------------------------- */
/*                           API CALL FUNCTIONS                              */
/* ------------------------------------------------------------------------- */

/**
 * Uploads a file to the backend.
 * @param file The file to upload.
 * @returns The JSON response from the backend.
 */
export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`File upload failed: ${errorText}`);
  }

  // Cast the response to UploadResponse
  return response.json() as Promise<UploadResponse>;
}

/**
 * Fetches the list of files from the backend.
 * @returns An array of file names.
 */
export async function getFiles(): Promise<string[]> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fetching files failed: ${errorText}`);
  }

  // Cast the JSON to GetFilesResponse
  const data = (await response.json()) as GetFilesResponse;
  return data.files;
}

/**
 * Downloads a file by its name.
 * @param fileName The name of the file to download.
 * @returns The file as a Blob.
 */
export async function downloadFile(fileName: string): Promise<Blob> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/download?fileName=${encodeURIComponent(fileName)}`
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Download failed: ${errorText}`);
  }

  return response.blob();
}

/**
 * Deletes a file by its name.
 * @param fileName The name of the file to delete.
 * @returns The JSON response from the backend.
 */
export async function deleteFile(fileName: string): Promise<DeleteResponse> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/delete?fileName=${encodeURIComponent(fileName)}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deletion failed: ${errorText}`);
  }

  return response.json() as Promise<DeleteResponse>;
}

/**
 * Retrieves a preview of a file.
 * @param fileName The name of the file to preview.
 * @returns A Blob representing the preview data.
 */
export async function previewFile(fileName: string): Promise<Blob> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/preview?fileName=${encodeURIComponent(fileName)}`
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Preview failed: ${errorText}`);
  }

  return response.blob();
}
