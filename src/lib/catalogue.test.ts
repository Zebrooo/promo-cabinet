import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readCatalogue, writeCatalogue, mutateCatalogue } from './catalogue';
import { addPromo } from './mutations';
import { catalogueKey, getS3Client, resetS3ClientForTests } from './s3';
import { env } from '@/env';
import type { Promo } from './schema';

const make = (id: string): Promo => ({
  id, name: id, startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline', title: id,
});

/** Write raw bytes to the current catalogue key (test seam to pre-seed state). */
const putRaw = (text: string) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: catalogueKey(), Body: text, ContentType: 'application/json',
  }));

beforeEach(() => {
  // Isolate each test under a unique key prefix in the shared real bucket.
  process.env.PROMO_KEY_PREFIX = `test/catalogue/${randomUUID()}/`;
  resetS3ClientForTests();
});

afterEach(async () => {
  await getS3Client()
    .send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: catalogueKey() }))
    .catch(() => {});
});

describe('readCatalogue', () => {
  it('returns the parsed promos', async () => {
    await putRaw(JSON.stringify([make('a')]));
    const { promos } = await readCatalogue();
    expect(promos.map((p) => p.id)).toEqual(['a']);
  });

  it('returns an empty catalogue when the object does not exist', async () => {
    const { promos } = await readCatalogue();
    expect(promos).toEqual([]);
  });

  it('throws on a schema-invalid catalogue', async () => {
    await putRaw(JSON.stringify([{ id: 'x' }]));
    await expect(readCatalogue()).rejects.toThrow();
  });
});

describe('writeCatalogue', () => {
  it('persists promos that read back identically', async () => {
    await writeCatalogue([make('a'), make('b')]);
    const { promos } = await readCatalogue();
    expect(promos.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('mutateCatalogue', () => {
  it('reads, applies the mutation, and writes the result', async () => {
    await putRaw(JSON.stringify([make('a')]));
    const result = await mutateCatalogue((promos) => addPromo(promos, make('b')));
    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
    const { promos } = await readCatalogue();
    expect(promos.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('propagates a domain error from the mutation and does not write', async () => {
    await putRaw(JSON.stringify([make('a')]));
    await expect(mutateCatalogue(() => { throw new Error('boom'); })).rejects.toThrow('boom');
    const { promos } = await readCatalogue();
    expect(promos.map((p) => p.id)).toEqual(['a']);
  });
});
