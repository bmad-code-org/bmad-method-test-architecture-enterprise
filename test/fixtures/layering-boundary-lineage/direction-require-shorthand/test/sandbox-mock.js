'use strict';

function buildSandbox(mockFs) {
  return {
    require(name) {
      if (name === 'fs') {
        return mockFs;
      }
      throw new Error(`unexpected workflow dependency: ${name}`);
    },
  };
}

module.exports = { buildSandbox };
