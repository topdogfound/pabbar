import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { normalizeDomains } from './admin-orgs.service.js';

describe('normalizeDomains', () => {
  it('lowercases, strips @ and de-duplicates', () => {
    expect(normalizeDomains(['@Acme.COM', ' acme.com ', 'sub.example.co.uk'])).toEqual(['acme.com', 'sub.example.co.uk']);
  });

  it('accepts an empty list (no restriction)', () => {
    expect(normalizeDomains([])).toEqual([]);
  });

  it.each(['not a domain', 'a@b.com', 'nodot', '-bad.com', 'bad..com', 'x.c', 'https://acme.com', ''])(
    'rejects %j',
    (bad) => {
      expect(() => normalizeDomains([bad])).toThrow(BadRequestException);
    },
  );
});
