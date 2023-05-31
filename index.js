import { Buffer } from 'node:buffer';
import net from 'node:net';
import crypto from 'node:crypto';
import config from './config.json' assert { type: 'json' };

var PACKET_TYPES = {
  SERVERDATA_AUTH: 3,
  SERVERDATA_AUTH_RESPONSE: 2,
  SERVERDATA_EXECCOMMAND: 2,
  SERVERDATA_RESPONSE_VALUE: 0,
};

var rcon = await rcon_connect(config.host, config.port);
await rcon.auth(config.password);

/**
 * Send commands using user input
 */
if (config.readlineEnabled) {
  var readline = await import('node:readline/promises');
  var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', exit);

  while (1) {
    var command = await rl.question('> ');
    if (command == '.exit') exit();
    console.log(`[RCON]: Executing "${command}"`);
    var response = await rcon.command(command);
    console.log(`[RCON]: Response:`, response);
  }
}

/**
 * Creates Basic Packet Structure
 * Link: https://developer.valvesoftware.com/wiki/Source_RCON_Protocol#Basic_Packet_Structure
 *
 * @param {number} id
 * @param {number} type
 * @param {string} body
 * @returns {Buffer}
 */
function rcon_create_packet_structure(id, type, body) {
  var size = Buffer.byteLength(body) + 14;
  var buffer = Buffer.alloc(size);

  buffer.writeInt32LE(size - 4, 0);
  buffer.writeInt32LE(id, 4);
  buffer.writeInt32LE(type, 8);
  buffer.write(body, 12, size - 2, 'ascii');
  buffer.writeInt16LE(0x00, size - 2);

  return buffer;
}

/**
 * Packet structure type
 * @typedef {Object} PacketStructure
 * @property {number} size
 * @property {number} id
 * @property {number} type
 * @property {string} body
 */

/**
 * Return object that contains packet data
 *
 * @param {Buffer} buffer
 * @returns {PacketStructure}
 */
function rcon_get_packet_structure(buffer) {
  return {
    size: buffer.readInt32LE(0),
    id: buffer.readInt32LE(4),
    type: buffer.readInt32LE(8),
    body: buffer.toString('ascii', 12, buffer.length - 2),
  };
}

/**
 * Will create a new socket
 *
 * @param {string} host
 * @param {number} port
 * @returns {Promise<net.Socket>}
 */
async function rcon_create_connection(host, port) {
  return new Promise((resolve, reject) => {
    var socket = net
      .createConnection(
        {
          host,
          port,
        },
        () => {
          console.log('[RCON]: Successfully connected to the server!');
          resolve(socket);
        }
      )
      .on('error', (error) => reject(error));
  });
}

/**
 * Creates a new connection
 *
 * @param {string} host
 * @param {number} port
 */
async function rcon_connect(host, port) {
  try {
    var connection = await rcon_create_connection(host, port);

    return {
      connection,

      close() {
        connection.end();
      },

      /**
       * Send RCON command
       *
       * @param {string} name
       * @returns
       */
      async command(name) {
        var response = await this.send(
          rcon_create_packet_structure(
            crypto.randomInt(10000),
            PACKET_TYPES.SERVERDATA_EXECCOMMAND,
            name
          )
        );
        return response;
      },

      /**
       * Auhtenticate RCON client
       *
       * @param {string} password
       * @returns
       */
      async auth(password) {
        var response = await this.send(
          rcon_create_packet_structure(10, PACKET_TYPES.SERVERDATA_AUTH, password)
        );
        return response;
      },

      /**
       * Send RCON packet
       *
       * @param {PacketStructure} packet
       * @returns {Promise<PacketStructure>}
       */
      async send(packet) {
        connection.write(packet);
        return new Promise((resolve, reject) => {
          connection.removeAllListeners('data');
          connection.removeAllListeners('error');
          connection.on('data', (data) => {
            var packet = rcon_get_packet_structure(data);

            /**
             * Check on password valid
             */
            if (packet.type === 2 && packet.id === -1) {
              throw new Error('Wrong RCON password!');
            }

            resolve(packet);
          });
          connection.on('error', (error) => reject(error));
        });
      },
    };
  } catch (error) {
    throw error;
  }
}

function exit() {
  console.log('\n[RCON]: Closing connection...');
  rcon.close();
  process.exit(1);
}
