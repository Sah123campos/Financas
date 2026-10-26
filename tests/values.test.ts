import { describe, expect, it } from 'vitest';
import { coerce, detectType, parseDate, parseNumber } from '../src/data/values';

describe('parseNumber', () => {
  it.each([
    ['1.234,56', 1234.56], ['R$ 1.234,56', 1234.56], ['-R$ 10,00', -10], ['(10,50)', -10.5], ['1,234.56', 1234.56],
    ['12,5', 12.5], ['12.5', 12.5], ['1.234', 1234], ['0.125', 0.125], ['1.234.567', 1234567], ['10%', 10], [42, 42], ['50-', -50],
  ])('%s → %s', (raw, n) => expect(parseNumber(raw)).toBe(n));
  it('rejeita texto', () => { expect(parseNumber('abc')).toBeNull(); expect(parseNumber('')).toBeNull(); expect(parseNumber('12a')).toBeNull(); });
});

describe('parseDate', () => {
  it.each([
    ['05/03/2025', '2025-03-05'], ['2025-03-05', '2025-03-05'], ['5-3-25', '2025-03-05'], ['2025-03-05T10:00:00', '2025-03-05'], [45721, '2025-03-05'], ['03/2025', '2025-03-01'],
  ])('%s → %s', (raw, iso) => expect(parseDate(raw)).toBe(iso));
  it('rejeita datas impossíveis', () => { expect(parseDate('31/02/2025')).toBeNull(); expect(parseDate('13/13/2025')).toBeNull(); expect(parseDate('ontem')).toBeNull(); });
});

describe('detectType', () => {
  it('reconhece tipos', () => {
    expect(detectType(['01/01/2025', '02/01/2025'], 'Data')).toBe('date');
    expect(detectType(['R$ 10,00', 'R$ 5,50'], 'x')).toBe('currency');
    expect(detectType(['10', '20,5'], 'Valor')).toBe('currency');
    expect(detectType(['10', '20'], 'Quantidade')).toBe('number');
    expect(detectType(['10%', '5%'], 'x')).toBe('percent');
    expect(detectType(['Sim', 'Não'], 'Pago')).toBe('boolean');
    expect(detectType(['Alimentação', 'Lazer'], 'Categoria')).toBe('text');
  });
});

describe('coerce', () => {
  it('converte percentuais em fração', () => { expect(coerce('12%', 'percent').value).toBe(0.12); expect(coerce(0.3, 'percent').value).toBe(0.3); });
  it('marca inválidos sem descartar vazio', () => { expect(coerce('x', 'number')).toEqual({ value: null, ok: false }); expect(coerce('', 'number')).toEqual({ value: null, ok: true }); });
});

describe('detectType tolerante', () => {
  it('coluna "Valor" com um valor inválido continua numérica', () => {
    expect(detectType(['-152,30', '5.200,00', '-23,90', 'abc'], 'Valor')).toBe('currency');
    expect(detectType(['10', 'abc', 'x', '5'], 'Nome')).toBe('text');
  });
});
