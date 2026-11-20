export interface ServerTestCase {
  args: unknown[];
  expected: unknown;
  isHidden: boolean;
}

export interface ServerChallengeSpec {
  id: string;
  functionName: string;
  xpReward: number;
  tests: ServerTestCase[];
}

export const SERVER_CHALLENGE_SPECS: Record<string, ServerChallengeSpec> = {
  'two-sum-indices': {
    id: 'two-sum-indices',
    functionName: 'twoSum',
    xpReward: 60,
    tests: [
      { args: [[2, 7, 11, 15], 9], expected: [0, 1], isHidden: false },
      { args: [[3, 2, 4], 6], expected: [1, 2], isHidden: false },
      { args: [[3, 3], 6], expected: [0, 1], isHidden: true },
      { args: [[-5, 1, 8, 12], 7], expected: [0, 3], isHidden: true },
      { args: [[10, 22, 5, 75, 65, 80], 85], expected: [2, 5], isHidden: true },
    ],
  },
  'valid-palindrome': {
    id: 'valid-palindrome',
    functionName: 'isPalindrome',
    xpReward: 50,
    tests: [
      { args: ['A man, a plan, a canal: Panama'], expected: true, isHidden: false },
      { args: ['race a car'], expected: false, isHidden: false },
      { args: [' '], expected: true, isHidden: true },
      { args: ['0P'], expected: false, isHidden: true },
      { args: ['Was it a car or a cat I saw?'], expected: true, isHidden: true },
    ],
  },
  'balanced-brackets': {
    id: 'balanced-brackets',
    functionName: 'isValidBrackets',
    xpReward: 75,
    tests: [
      { args: ['()[]{}'], expected: true, isHidden: false },
      { args: ['(]'], expected: false, isHidden: false },
      { args: ['{[]}'], expected: true, isHidden: true },
      { args: ['([)]'], expected: false, isHidden: true },
      { args: ['((({{{[[[]]]}}})))'], expected: true, isHidden: true },
    ],
  },
  'max-subarray-sum': {
    id: 'max-subarray-sum',
    functionName: 'maxSubArray',
    xpReward: 90,
    tests: [
      { args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6, isHidden: false },
      { args: [[1]], expected: 1, isHidden: false },
      { args: [[5, 4, -1, 7, 8]], expected: 23, isHidden: true },
      { args: [[-4, -2, -7, -1]], expected: -1, isHidden: true },
    ],
  },
  'group-anagrams-count': {
    id: 'group-anagrams-count',
    functionName: 'countAnagramGroups',
    xpReward: 100,
    tests: [
      { args: [['eat', 'tea', 'tan', 'ate', 'nat', 'bat']], expected: 3, isHidden: false },
      { args: [['']], expected: 1, isHidden: false },
      { args: [['abc', 'bca', 'cab', 'xyz', 'zyx', 'foo']], expected: 3, isHidden: true },
      { args: [['listen', 'silent', 'enlist', 'google', 'gogole']], expected: 2, isHidden: true },
    ],
  },
  'binary-search-target': {
    id: 'binary-search-target',
    functionName: 'binarySearch',
    xpReward: 65,
    tests: [
      { args: [[-1, 0, 3, 5, 9, 12], 9], expected: 4, isHidden: false },
      { args: [[-1, 0, 3, 5, 9, 12], 2], expected: -1, isHidden: false },
      { args: [[5], 5], expected: 0, isHidden: true },
      { args: [[2, 4, 6, 8, 10, 12, 14], 14], expected: 6, isHidden: true },
    ],
  },
};
