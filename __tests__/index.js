const schemaDDB = require('../');

test('All libs are exposed', () => {
  expect(schemaDDB.Table).toBeDefined();
});
