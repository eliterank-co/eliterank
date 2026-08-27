import { describe, expect, it } from 'vitest';
import { evaluateNomineePasswordPolicy } from '../../supabase/functions/_shared/nomineePasswordPolicy';

describe('evaluateNomineePasswordPolicy', () => {
  it('refuses to reset an existing account password through a nominee claim', () => {
    expect(evaluateNomineePasswordPolicy({
      nomineeEmail: 'nominee@example.com',
      clientEmail: 'nominee@example.com',
      existingAuthUserId: 'existing-user-id',
    })).toEqual({
      allowed: false,
      status: 409,
      error: 'An account with this email already exists. Use the secure sign-in link or your existing password.',
    });
  });

  it('refuses to move a nomination to a different email address', () => {
    expect(evaluateNomineePasswordPolicy({
      nomineeEmail: 'nominee@example.com',
      clientEmail: 'attacker@example.com',
      existingAuthUserId: null,
    })).toEqual({
      allowed: false,
      status: 403,
      error: 'The email address does not match this nomination.',
    });
  });

  it('allows a new account for the nominated email', () => {
    expect(evaluateNomineePasswordPolicy({
      nomineeEmail: ' Nominee@Example.com ',
      clientEmail: 'nominee@example.com',
      existingAuthUserId: null,
    })).toEqual({ allowed: true, email: 'nominee@example.com', action: 'create' });
  });

  it('allows recovery only for a partial account stamped by this request', () => {
    expect(evaluateNomineePasswordPolicy({
      nomineeEmail: 'nominee@example.com',
      clientEmail: 'nominee@example.com',
      existingAuthUserId: 'partial-user-id',
      creationNonce: 'request-only-nonce',
      existingUserCreationNonce: 'request-only-nonce',
    })).toEqual({
      allowed: true,
      email: 'nominee@example.com',
      action: 'recover_partial',
    });
  });

  it('refuses partial-account recovery when the request nonce does not match', () => {
    expect(evaluateNomineePasswordPolicy({
      nomineeEmail: 'nominee@example.com',
      clientEmail: 'nominee@example.com',
      existingAuthUserId: 'existing-user-id',
      creationNonce: 'this-request',
      existingUserCreationNonce: 'someone-else',
    })).toEqual({
      allowed: false,
      status: 409,
      error: 'An account with this email already exists. Use the secure sign-in link or your existing password.',
    });
  });
});
