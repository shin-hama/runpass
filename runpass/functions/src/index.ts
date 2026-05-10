import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { detectEncounters } from './detectEncounters';

admin.initializeApp();
const db = admin.firestore();

export const onRunCompleted = onDocumentUpdated(
  {
    document: 'runs/{runId}',
    region: 'asia-northeast1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // status が 'completed' に変わったとき、かつ未処理のとき
    if (
      before?.status !== 'completed' &&
      after?.status === 'completed' &&
      after?.processed === false
    ) {
      const runId = event.params.runId;
      functions.logger.info(`[onRunCompleted] Processing runId=${runId}`);
      await detectEncounters(db, runId);
    }
  }
);
