import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { testApp } from './helpers/app';

const id = '11111111-1111-4111-8111-111111111111';
const secret = 'test-operator-refund-secret-0123456789';

describe('trusted operator disbursement refund endpoint', () => {
  it('requires the separate operator secret before looking up a disbursement', async () => {
    const missing = await request(testApp()).post(`/ops/disbursements/${id}/refund`).send({
      feeKept: 0,
      reason: 'Provider confirmed reversal',
    });
    expect(missing.status).toBe(401);

    const wrong = await request(testApp())
      .post(`/ops/disbursements/${id}/refund`)
      .set('Authorization', 'Bearer not-the-secret')
      .send({ feeKept: 0, reason: 'Provider confirmed reversal' });
    expect(wrong.status).toBe(401);
  });

  it('accepts the secret only for a schema-valid refund request', async () => {
    const invalid = await request(testApp())
      .post(`/ops/disbursements/${id}/refund`)
      .set('Authorization', `Bearer ${secret}`)
      .send({ feeKept: 0.5, reason: 'short' });
    expect(invalid.status).toBe(400);

    const validShape = await request(testApp())
      .post(`/ops/disbursements/${id}/refund`)
      .set('Authorization', `Bearer ${secret}`)
      .send({ feeKept: 0, reason: 'Provider confirmed reversal' });
    expect(validShape.status).toBe(409);
    expect(validShape.body.code).toBe('ACTION_NOT_AVAILABLE');
  });
});
