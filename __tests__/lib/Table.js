jest.mock('entity-schema');
const aws = require('aws-sdk');

class MockDynamo {
  constructor() {
    this.promiseMock = jest.fn(() => Promise.resolve());
    this.createTable = jest.fn(() => ({
      promise: this.promiseMock,
    }));
    this.deleteTable = jest.fn(() => ({
      promise: this.promiseMock,
    }));
  }
}
jest.spyOn(aws, 'DynamoDB').mockImplementation(() => new MockDynamo());

const Schema = require('entity-schema');
const Table = require('../../lib/Table');

let stubs = [];
const table = new Table('someTable', {});

beforeEach(() => {
  stubs = [];
});

afterEach(() => {
  table.config = {};
  stubs.forEach(stub => stub.mockRestore());
});

describe('An instance of the Table class', () => {
  test('can be constructed', () => {
    expect(table.name).toBe('someTable');
    expect(table.config).toEqual({});
    expect(Schema).toHaveBeenCalledWith({}, {});
    expect(table.schema).toBeInstanceOf(Schema);
    expect(table.dynamodb).toBeInstanceOf(MockDynamo);
    expect(aws.DynamoDB).toHaveBeenCalledWith({});
  });

  test('can create a table on DynamoDB', () => {
    expect.assertions(2);
    const def = { someDef: true };
    stubs.push(jest.spyOn(table, 'getTableDefinition').mockReturnValue(Promise.resolve(def)));
    return table.create()
      .then(() => {
        expect(table.dynamodb.createTable).toHaveBeenCalledWith(def);
        expect(table.dynamodb.promiseMock).toHaveBeenCalled();
      });
  });

  test('can delete a table on DynamoDB', () => {
    expect.assertions(2);
    return table.delete()
      .then(() => {
        expect(table.dynamodb.deleteTable).toHaveBeenCalledWith({ TableName: 'someTable' });
        expect(table.dynamodb.promiseMock).toHaveBeenCalled();
      });
  });

  test('can generate table definitions', () => {
    expect.assertions(3);
    const expected = {
      TableName: 'someTable',
      AttributeDefinitions: { someDef: true },
      KeySchema: [{ keySchema: true }],
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 2,
      },
    };
    stubs.push(jest.spyOn(table, 'getAttributeDefinitions').mockReturnValue(expected.AttributeDefinitions));
    stubs.push(jest.spyOn(table, 'getKeySchema').mockReturnValue(Promise.resolve(expected.KeySchema)));
    table.config.readCapacity = 1;
    table.config.writeCapacity = 2;
    return table.getTableDefinition()
      .then((res) => {
        expect(res).toEqual(expected);
        expect(table.getAttributeDefinitions).toHaveBeenCalled();
        expect(table.getKeySchema).toHaveBeenCalled();
      });
  });

  test('can generate attribute definitions without sort key', () => {
    expect.assertions(1);
    const expected = [
      { AttributeName: 'id', AttributeType: 'S' },
    ];
    stubs.push(jest.spyOn(table.schema, 'getFields').mockReturnValue(Promise.resolve({ thisIsOnlyA: { type: 'test' } })));
    stubs.push(jest.spyOn(Table, 'modelToDynamoType').mockReturnValue('TEST'));
    return table.getAttributeDefinitions()
      .then((res) => {
        expect(res).toEqual(expected);
      });
  });

  test('can generate attribute definitions with sort key', () => {
    expect.assertions(3);
    const tableWithSort = new Table('tableWithSort', { sortKey: 'thisIsOnlyA' });
    const expected = [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'thisIsOnlyA', AttributeType: 'TEST' },
    ];
    stubs.push(jest.spyOn(table.schema, 'getFields').mockReturnValue(Promise.resolve({ thisIsOnlyA: { type: 'test' } })));
    stubs.push(jest.spyOn(Table, 'modelToDynamoType').mockReturnValue('TEST'));
    return table.getAttributeDefinitions([tableWithSort.config.sortKey])
      .then((res) => {
        expect(res).toEqual(expected);
        expect(table.schema.getFields).toHaveBeenCalledWith([tableWithSort.config.sortKey]);
        expect(Table.modelToDynamoType).toHaveBeenCalledWith('test');
      });
  });

  test('can generate a key schema with hash and sort keys', () => {
    expect.assertions(2);
    const expected = [
      { AttributeName: 'id', KeyType: 'HASH' },
      { AttributeName: 'thisIsOnlyA', KeyType: 'RANGE' },
    ];
    table.config.sortKey = 'thisIsOnlyA';
    stubs.push(jest.spyOn(table.schema, 'getFields').mockReturnValue(Promise.resolve({ thisIsOnlyA: { type: 'test' } })));
    return table.getKeySchema()
      .then((res) => {
        expect(res).toEqual(expected);
        expect(table.schema.getFields).toHaveBeenCalled();
      });
  });

  test('can generate a key schema with hash key only', () => {
    expect.assertions(2);
    const expected = [
      { AttributeName: 'id', KeyType: 'HASH' },
    ];
    stubs.push(jest.spyOn(table.schema, 'getFields').mockReturnValue(Promise.resolve({ thisIsOnlyA: { type: 'test' } })));
    return table.getKeySchema()
      .then((res) => {
        expect(res).toEqual(expected);
        expect(table.schema.getFields).toHaveBeenCalled();
      });
  });

  test('can map schema types to DynamoDB types', () => {
    expect.assertions(8);
    expect(Table.modelToDynamoType('string')).toBe('S');
    expect(Table.modelToDynamoType('boolean')).toBe('BOOL');
    expect(Table.modelToDynamoType('number')).toBe('N');
    expect(Table.modelToDynamoType('integer')).toBe('N');
    expect(Table.modelToDynamoType('null')).toBe('NULL');
    expect(Table.modelToDynamoType('object')).toBe('M');
    expect(Table.modelToDynamoType('array')).toBe('L');
    expect(() => Table.modelToDynamoType('somethingElse')).toThrow('Unsupported type: somethingElse');
  });
});
