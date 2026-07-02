/**
 * Hermetic S3 for the test suite.
 *
 * Historically the suite ran against the real bucket.ru bucket (credentials
 * from .env), which required live creds on every machine — and once wiped
 * production objects (see the guardKey story in src/lib/s3.ts). By default we
 * now substitute an in-memory bucket via aws-sdk-client-mock: Get/Put/Delete
 * behave like real S3, including a NoSuchKey rejection for a missing object,
 * so `isNoSuchKey()`-based code paths work unchanged.
 *
 * To run the suite against the real bucket as before, set
 * PROMO_TEST_LIVE_S3=true (with credentials present in .env).
 */
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const useLiveS3 = process.env.PROMO_TEST_LIVE_S3 === 'true';

if (!useLiveS3) {
  if (!process.env.PROMO_BUCKET) process.env.PROMO_BUCKET = 'test-bucket';

  /** `${Bucket}/${Key}` → object body (utf-8 text). */
  const store = new Map<string, string>();
  const keyOf = (input: { Bucket?: string; Key?: string }) => `${input.Bucket}/${input.Key}`;

  class NoSuchKey extends Error {
    readonly $metadata = { httpStatusCode: 404 };
    constructor() {
      super('The specified key does not exist.');
      this.name = 'NoSuchKey';
    }
  }

  const s3Mock = mockClient(S3Client);

  s3Mock.on(PutObjectCommand).callsFake(async (input: { Bucket?: string; Key?: string; Body?: unknown }) => {
    const body = input.Body;
    const text =
      typeof body === 'string'
        ? body
        : Buffer.from(body as Uint8Array).toString('utf8');
    store.set(keyOf(input), text);
    return {};
  });

  s3Mock.on(GetObjectCommand).callsFake(async (input: { Bucket?: string; Key?: string }) => {
    const text = store.get(keyOf(input));
    if (text === undefined) throw new NoSuchKey();
    return {
      Body: {
        transformToString: async () => text,
        transformToWebStream: () =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(text));
              controller.close();
            },
          }),
      },
    };
  });

  s3Mock.on(DeleteObjectCommand).callsFake(async (input: { Bucket?: string; Key?: string }) => {
    store.delete(keyOf(input));
    return {};
  });
}
