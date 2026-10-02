import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateProfileDto, isValidDob } from './profile.dto.js';

const NOW = new Date('2026-10-02T00:00:00Z');

describe('isValidDob', () => {
  it('accepts a normal past date', () => expect(isValidDob('1990-01-31', NOW)).toBe(true));
  it('rejects future dates', () => expect(isValidDob('2027-01-01', NOW)).toBe(false));
  it('rejects under 13', () => {
    expect(isValidDob('2015-01-01', NOW)).toBe(false);
    expect(isValidDob('2013-10-02', NOW)).toBe(true);
  });
  it('rejects impossible dates and bad formats', () => {
    expect(isValidDob('2000-02-30', NOW)).toBe(false);
    expect(isValidDob('01/02/2000', NOW)).toBe(false);
  });
});

describe('UpdateProfileDto', () => {
  const check = (o: object) =>
    validate(plainToInstance(UpdateProfileDto, o), { whitelist: true });

  it('allows an empty patch and null clears', async () => {
    expect(await check({})).toHaveLength(0);
    expect(await check({ dateOfBirth: null, gender: null })).toHaveLength(0);
  });
  it('trims name and rejects blank or too long', async () => {
    expect(await check({ name: '   ' })).not.toHaveLength(0);
    expect(await check({ name: 'x'.repeat(81) })).not.toHaveLength(0);
    expect(await check({ name: null })).not.toHaveLength(0);
    expect(plainToInstance(UpdateProfileDto, { name: '  Ann ' }).name).toBe('Ann');
  });
  it('rejects unknown gender', async () => {
    expect(await check({ gender: 'X' })).not.toHaveLength(0);
  });
});
