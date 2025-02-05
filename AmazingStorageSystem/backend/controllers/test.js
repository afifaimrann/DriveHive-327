const chai = require('chai');
const { expect } = chai;
const sinon = require('sinon');
const { mockRequest, mockResponse } = require('mock-req-res');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const app = require('../amazingstoragesystem'); 

describe('Download Function Tests', () => {
    let firestoreStub;
    let driveStub;
    const testFileData = {
        name: 'tet.txt',
        driveId: 'drive1',
        googleDrivefileId: 'file123',
        isChunked: false,
        mimeType: 'text/plain',
        size: 1024
    };

    before(() => {
        // mock firestore
        firestoreStub = sinon.stub(admin.firestore(), 'collection');
        const docStub = {
            get: sinon.stub(),
            data: sinon.stub().returns(testFileData)
        };
        const queryStub = {
            where: sinon.stub().returnsThis(),
            get: sinon.stub()
        };
        firestoreStub.returns(queryStub);

        // mock google drive
        driveStub = sinon.stub(google, 'drive').returns({
            files: {
                get: sinon.stub()
            }
        });
    });

    afterEach(() => {
        sinon.resetHistory();
    });

    after(() => {
        sinon.restore();
    });

    it('should return 400 if fileName is missing', async () => {
        const req = mockRequest({ query: {} });
        const res = mockResponse();
        
        await app.get('/download', (req, res) => {})(req, res);
        
        expect(res.status.calledWith(400)).to.be.true;
        expect(res.send.calledWith('fileName query parameter is required')).to.be.true;
    });

    it('should return 404 if file not found in Firestore', async () => {
        const req = mockRequest({ query: { fileName: 'nonexistent.txt' } });
        const res = mockResponse();
        firestoreStub.CollectionReference.get.resolves({ empty: true });

        await app.get('/download', (req, res) => {})(req, res);
        
        expect(res.status.calledWith(404)).to.be.true;
        expect(res.send.calledWith('File not found')).to.be.true;
    });

    it('should return 500 if drive account not found', async () => {
        const req = mockRequest({ query: { fileName: 'test.txt' } });
        const res = mockResponse();
        firestoreStub.CollectionReference.get.resolves({ 
            empty: false,
            docs: [{ data: () => ({ ...testFileData, driveId: 'invalid-drive' }) }]
        });

        await app.get('/download', (req, res) => {})(req, res);
        
        expect(res.status.calledWith(500)).to.be.true;
        expect(res.send.calledWith('Associated Drive account not found')).to.be.true;
    });

    it('should return 501 for chunked files', async () => {
        const req = mockRequest({ query: { fileName: 'chunked-file.txt' } });
        const res = mockResponse();
        firestoreStub.CollectionReference.get.resolves({ 
            empty: false,
            docs: [{ data: () => ({ ...testFileData, isChunked: true }) }]
        });

        await app.get('/download', (req, res) => {})(req, res);
        
        expect(res.status.calledWith(501)).to.be.true;
        expect(res.send.calledWith('Chunked file download not yet implemented')).to.be.true;
    });

    it('should successfully download file', async () => {
        const req = mockRequest({ query: { fileName: 'test.txt' } });
        const res = mockResponse();
        const mockStream = {
            on: sinon.stub().callsArgWith(1, 'data').returnsThis(),
            pipe: sinon.stub()
        };

        // mock Firestore response
        firestoreStub.CollectionReference.get.resolves({ 
            empty: false,
            docs: [{ data: () => testFileData }]
        });

        // mock google drive responses
        driveStub.files.get
            .onFirstCall().resolves({ data: testFileData })
            .onSecondCall().resolves({ data: mockStream });

        await app.get('/download', (req, res) => {})(req, res);
        
        // verify headers
        expect(res.setHeader.calledWith('Content-Disposition', `attachment; filename="${testFileData.name}"`)).to.be.true;
        expect(res.setHeader.calledWith('Content-Type', testFileData.mimeType)).to.be.true;
        expect(res.setHeader.calledWith('Content-Length', testFileData.size)).to.be.true;
        
        // verify streaming
        expect(mockStream.pipe.calledWith(res)).to.be.true;
    });

    it('should handle stream errors', async () => {
        const req = mockRequest({ query: { fileName: 'test.txt' } });
        const res = mockResponse();
        const mockError = new Error('Stream error');
        const mockStream = {
            on: sinon.stub().callsArgWith(1, mockError).returnsThis(),
            pipe: sinon.stub()
        };

        // mock firestore response
        firestoreStub.CollectionReference.get.resolves({ 
            empty: false,
            docs: [{ data: () => testFileData }]
        });

        // mock google drive responses
        driveStub.files.get
            .onFirstCall().resolves({ data: testFileData })
            .onSecondCall().resolves({ data: mockStream });

        await app.get('/download', (req, res) => {})(req, res);
        
        expect(res.status.calledWith(500)).to.be.true;
        expect(res.end.called).to.be.true;
    });
});
       
