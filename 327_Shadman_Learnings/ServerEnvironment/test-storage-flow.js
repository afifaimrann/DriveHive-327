import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Writable } from 'stream';
import supabase from './src/config/supabase.js';
import { uploadFile, downloadFile, deleteFile } from './src/services/storage.service.js';

class MockResponse extends Writable {
  constructor(writeStream) {
    super();
    this.writeStream = writeStream;
    this.headersSent = false;
    this.headers = {};
  }

  setHeader(name, value) {
    this.headers[name] = value;
  }

  _write(chunk, encoding, callback) {
    this.writeStream.write(chunk, encoding, callback);
  }

  _final(callback) {
    this.writeStream.end(callback);
  }
}


/**
 * Storage aggregation integration test.
 * Creates a local 60MB dummy file, uploads it (which splits it into 2 chunks of 50MB and 10MB),
 * streams the chunks down to verify SHA-256 checksum integrity, and then deletes the chunks.
 */
async function runTest() {
  console.log('🚀 Starting DriveHive Storage Integration Test...');

  // Ensure uploads/downloads temp folders exist
  fs.mkdirSync('./uploads', { recursive: true });
  fs.mkdirSync('./downloads', { recursive: true });

  // 1. Fetch first registered user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username')
    .limit(1)
    .single();

  if (profileError || !profile) {
    console.error('\n❌ Error: No profiles found in Supabase! Please register an account in the web app first before running this test.');
    process.exit(1);
  }

  const userId = profile.id;
  console.log(`👤 Running test for user: "${profile.username}" (ID: ${userId})`);

  // 2. Fetch connected storage accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('cloud_accounts')
    .select('id, provider, email')
    .eq('user_id', userId);

  if (accountsError || !accounts || accounts.length === 0) {
    console.error('\n❌ Error: No connected cloud storage accounts found! Please connect a Google Drive or Dropbox account in the web app first.');
    process.exit(1);
  }

  console.log(`🔗 Found ${accounts.length} connected storage accounts:`);
  accounts.forEach((acc) => {
    console.log(`   - [${acc.provider.toUpperCase()}] ${acc.email} (ID: ${acc.id})`);
  });

  // 3. Create a 60MB random test file (exceeds our temporary 50MB chunking limit)
  const testFileName = `test-chunking-60mb-${Date.now()}.bin`;
  const tempPath = path.join('./uploads', testFileName);
  console.log(`\n📦 Generating a 60MB dummy file at ${tempPath}...`);

  const writeStream = fs.createWriteStream(tempPath);
  const bufferSize = 1024 * 1024; // 1 MB
  const randomBuffer = crypto.randomBytes(bufferSize);

  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => writeStream.write(randomBuffer, resolve));
  }
  writeStream.end();

  const originalSize = fs.statSync(tempPath).size;
  console.log(`✅ File created: ${(originalSize / (1024 * 1024)).toFixed(2)} MB`);

  // Compute file SHA-256 hash for integrity comparison
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(tempPath));
  const originalHash = hash.digest('hex');
  console.log(`🔑 Original File SHA-256 Checksum: ${originalHash}`);

  let fileRecord = null;

  try {
    // 4. Upload file (triggers chunking)
    console.log('\n📤 Uploading and chunking file...');
    const fileObject = {
      originalname: testFileName,
      mimetype: 'application/octet-stream',
      size: originalSize,
      path: tempPath,
    };

    fileRecord = await uploadFile(userId, fileObject);
    console.log(`✅ Upload complete! Database File ID: ${fileRecord.id}`);

    // Verify database chunk records
    const { data: chunks, error: chunksError } = await supabase
      .from('file_chunks')
      .select('*')
      .eq('file_id', fileRecord.id)
      .order('chunk_index', { ascending: true });

    if (chunksError || !chunks || chunks.length === 0) {
      throw new Error('Failed to retrieve uploaded chunks from database.');
    }

    console.log(`📊 Chunks generated and distributed (${chunks.length}):`);
    chunks.forEach((chunk) => {
      console.log(`   - Chunk #${chunk.chunk_index}: Size: ${(chunk.chunk_size / (1024 * 1024)).toFixed(2)} MB, Offset: ${chunk.offset_bytes} bytes`);
      console.log(`     Account: [${chunk.provider.toUpperCase()}] ID: ${chunk.cloud_account_id}`);
      console.log(`     Google File ID: ${chunk.provider_file_id || 'N/A'} | Dropbox Path: ${chunk.provider_path || 'N/A'}`);
    });

    // 5. Download and reassemble the file
    const downloadPath = path.join('./downloads', `downloaded-${testFileName}`);
    console.log(`\n📥 Downloading and reassembling chunks to ${downloadPath}...`);

    // Mock Express response object for chunk streaming using Writable class
    const writeStreamDest = fs.createWriteStream(downloadPath);
    const resMock = new MockResponse(writeStreamDest);

    await downloadFile(userId, fileRecord.id, resMock);

    // Wait for file write stream to close
    await new Promise((resolve, reject) => {
      writeStreamDest.on('finish', resolve);
      writeStreamDest.on('error', reject);
    });

    const downloadedSize = fs.statSync(downloadPath).size;
    console.log(`✅ Download finished. Size: ${(downloadedSize / (1024 * 1024)).toFixed(2)} MB`);

    // Verify downloaded file integrity checksum
    const downHash = crypto.createHash('sha256');
    downHash.update(fs.readFileSync(downloadPath));
    const downloadedHash = downHash.digest('hex');
    console.log(`🔑 Downloaded File SHA-256 Checksum: ${downloadedHash}`);

    if (originalHash === downloadedHash) {
      console.log('\n🎉 SUCCESS: File integrity verified! Downloaded file matches original file exactly.');
    } else {
      console.error('\n❌ ERROR: Integrity check failed. Downloaded file is corrupted!');
    }

    // Clean up local downloaded file
    if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
  } finally {
    // 6. Database and Cloud Storage cleanup
    if (fileRecord) {
      console.log('\n🧹 Cleaning up database and cloud storage chunks...');
      try {
        await deleteFile(userId, fileRecord.id);
        console.log('✅ Deleted successfully!');
      } catch (delErr) {
        console.error('❌ Failed to clean up database/cloud chunks:', delErr);
      }
    }

    // Clean up local temp file
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {}
    }

    console.log('\n🏁 Storage Integration Test Finished.');
  }
}

runTest();
