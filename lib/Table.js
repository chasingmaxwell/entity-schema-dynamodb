const Schema = require('entity-schema');
const aws = require('aws-sdk');
const _ = require('lodash');

/**
 * Manage DynamoDB tables based on an entity schema.
 */
class Table {

  constructor(name, schema, config = {}) {
    this.name = name;
    this.config = config;
    this.dynamodb = new aws.DynamoDB(_.get(this.config, 'awsConfig', {}));
    this.schema = new Schema(schema, _.get(this.config, 'schemaConfig', {}));
  }

  /**
   * Create the DynamoDB table.
   *
   * @return {Promise<Object>}
   *   A promise which resolves with an object returned by the AWS SDK
   *   representing the properties of the newly created table.
   */
  create() {
    return this.getTableDefinition()
      .then(definition => this.dynamodb.createTable(definition).promise());
  }

  /**
   * Delete the DynamoDB table.
   *
   * @return {Promise<Object>}
   *   A promise which resolves with an object returned by the AWS SDK
   *   representing the properties of the deleted table.
   */
  delete() {
    return this.dynamodb.deleteTable({ TableName: this.name }).promise();
  }

  /**
   * Gets the TableDefinition object as expected by the AWS SDK.
   *
   * @return {Promise<Object>}
   *   A promise which resolves with the TableDefinition object as expected by
   *   the AWS SDK createTable method.
   */
  getTableDefinition() {
    return this.getKeySchema()
      .then((keySchema) => {
        const fieldNames = keySchema
          .filter(att => att.AttributeName !== 'id')
          .map(att => att.AttributeName);
        return Promise.all([this.getAttributeDefinitions(fieldNames), keySchema]);
      })
      .then(([definitions, keySchema]) => ({
        TableName: this.name,
        AttributeDefinitions: definitions,
        KeySchema: keySchema,
        ProvisionedThroughput: {
          ReadCapacityUnits: _.get(this.config, 'readCapacity', 1),
          WriteCapacityUnits: _.get(this.config, 'writeCapacity', 1),
        },
      }));
  }

  /**
   * Gets AttributeDefinitions as expected by the AWS SDK in the TableDefinition
   * object.
   *
   * The "id" attribute is hard-coded since (with JSON API resource objects)
   * that will always be the HASH key on a DynamoDB table. For any other
   * attributes we build the definition with information from the schema.
   *
   * @param {String[]}
   *   An array of field names from which to generate AttributeDefinitions.
   *
   * @return {Promise<Object>}
   *   A promise which resolves with the AttributeDefinitions object.
   */
  getAttributeDefinitions(names = []) {
    return Promise.resolve(names.length > 0 ? this.schema.getFields(names) : {})
      .then(fields => [
        { AttributeName: 'id', AttributeType: 'S' },
        ...Object.keys(fields).map(name => ({
          AttributeName: name,
          AttributeType: Table.modelToDynamoType(fields[name].type),
        })),
      ]);
  }

  /**
   * Gets the hash key for the key schema expected by AWS SDK.
   *
   * @return {Promise<Object>}
   *   A promise which resolves with the hash key definition for use in the
   *   KeySchema property of the TableDefinition expected by AWS SDK.
   */
  getHashKey() { // eslint-disable-line class-methods-use-this
    return Promise.resolve({ AttributeName: 'id', KeyType: 'HASH' });
  }

  /**
   * Gets the sort key for the key schema expected by AWS SDK.
   *
   * @return {Promise<Object>}
   *   A promise which resolves with the sort key definition for use in the
   *   KeySchema property of the TableDefinition expected by AWS SDK.
   */
  getSortKey() {
    const sortKey = _.get(this.config, 'sortKey');
    return !sortKey
      ? Promise.resolve(undefined)
      : this.schema.getFields(sortKey)
          .then(fields => ({ AttributeName: Object.keys(fields)[0], KeyType: 'RANGE' }));
  }

  /**
   * Gets the key schema expected by AWS SDK.
   *
   * @return {Promise<Object>}
   *   A promise which resolves with the KeySchema for use in the
   *   TableDefinition object expected by AWS SDK.
   */
  getKeySchema() {
    return Promise.all([this.getHashKey(), this.getSortKey()])
      .then(key => key.filter(_.identity));
  }

  /**
   * Map model types to DynamoDB types.
   *
   * @param {String} type
   *   The type of the property according to the data model.
   *
   * @throws {Error}
   *   Throws an error if the type is unsupported.
   *
   * @return {String}
   *   The appropriate DynamoDB type based on the model type provided.
   */
  static modelToDynamoType(type) {
    const typeMap = {
      string: 'S',
      boolean: 'BOOL',
      number: 'N',
      integer: 'N',
      null: 'NULL',
      object: 'M',
      // @TODO: support SS and NS types (arrays of type string or type number).
      // This requires more complex handling of the schema since we would need
      // to inspect the allowed types within the array.
      array: 'L',
    };

    if (typeof typeMap[type] === 'undefined') {
      throw new Error(`Unsupported type: ${type}`);
    }

    return typeMap[type];
  }

}

module.exports = Table;
