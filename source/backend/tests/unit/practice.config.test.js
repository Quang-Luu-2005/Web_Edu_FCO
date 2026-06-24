const {
  RANK_VALUES,
  getRankLabel,
  isProfileCompleteForPractice,
} = require('../../config/practice.config');

describe('practice.config', () => {
  test('returns labels for known ranks', () => {
    expect(getRankLabel('sieu-sao')).toBe('Siêu sao');
    expect(getRankLabel('unknown')).toBe('');
  });

  test('exposes accepted rank values', () => {
    expect(RANK_VALUES).toContain('ban-chuyen');
    expect(RANK_VALUES).toContain('sieu-sao');
  });

  test('requires zalo phone, in-game name, and valid rank for practice profile', () => {
    expect(isProfileCompleteForPractice(null)).toBe(false);
    expect(isProfileCompleteForPractice({ zaloPhone: '0901234567', inGameName: 'Player', rank: 'sieu-sao' })).toBe(true);
    expect(isProfileCompleteForPractice({ zaloPhone: '', inGameName: 'Player', rank: 'sieu-sao' })).toBe(false);
    expect(isProfileCompleteForPractice({ zaloPhone: '0901234567', inGameName: '', rank: 'sieu-sao' })).toBe(false);
    expect(isProfileCompleteForPractice({ zaloPhone: '0901234567', inGameName: 'Player', rank: 'invalid' })).toBe(false);
  });
});
