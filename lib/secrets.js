import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

//encryption settings
//GCM is used because it also checks that the value was not changed
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

//getting the master key from environment
//it must not be stored in database next to the encrypted keys
function masterKey() {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) throw new Error('ENCRYPTION_KEY is not set');

    const key = Buffer.from(raw, 'hex');
    //32 bytes is what aes-256 needs
    if (key.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be 32 bytes as 64 hex characters');
    }

    return key;
}

//encrypting a key before saving it to database
export function encryptSecret(plainText) {
    //new random iv for every value
    //the same iv would show when two people saved the same key
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, masterKey(), iv);

    const encrypted = Buffer.concat([
        cipher.update(plainText, 'utf8'),
        cipher.final(),
    ]);

    //tag proves the value was not changed in database
    const tag = cipher.getAuthTag();

    //everything is stored in one string
    return [
        iv.toString('hex'),
        tag.toString('hex'),
        encrypted.toString('hex')
    ].join(':');
}

//getting the key back before calling Fathom
export function decryptSecret(stored) {
    const [ivHex, tagHex, dataHex] = String(stored).split(':');

    //error handling
    if (!ivHex || !tagHex || !dataHex) {
        throw new Error('Stored secret is malformed');
    }

    const decipher = createDecipheriv(
        ALGORITHM,
        masterKey(),
        Buffer.from(ivHex, 'hex'),
    );

    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

    return Buffer.concat([
        decipher.update(Buffer.from(dataHex, 'hex')),
        decipher.final(),
    ]).toString('utf8');
}

//last four characters shown in the interface
//stored separately so the settings page never needs the master key
export function secretHint(plainText) {
    return plainText.slice(-4);
}