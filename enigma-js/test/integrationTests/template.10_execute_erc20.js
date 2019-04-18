/* eslint-disable require-jsdoc */
import fs from 'fs';
import os from 'os';
import path from 'path';
import forge from 'node-forge';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import EnigmaContract from '../../../build/contracts/Enigma';
import EnigmaTokenContract from '../../../build/contracts/EnigmaToken';
import SampleContract from '../../../build/contracts/Sample';
import * as eeConstants from '../../src/emitterConstants';
import data from '../data';
import EthCrypto from 'eth-crypto';
import BN from 'bn.js';
import elliptic from 'elliptic';

let ec = new elliptic.ec('secp256k1');


forge.options.usePureJavaScript = true;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Enigma tests', () => {
  let accounts;
  let web3;
  let enigma;
  let sampleContract;
  let epochSize;
  it('initializes', () => {
    const provider = new Web3.providers.HttpProvider('http://localhost:9545');
    web3 = new Web3(provider);
    return web3.eth.getAccounts().then((result) => {
      accounts = result;
      console.log('the accounts', accounts);
      enigma = new Enigma(
        web3,
        EnigmaContract.networks['4447'].address,
        EnigmaTokenContract.networks['4447'].address,
        'http://localhost:3346',
        {
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        },
      );
      enigma.admin();
      expect(Enigma.version()).toEqual('0.0.1');
    });
  });

  const homedir = os.homedir();
  const erc20Addr = fs.readFileSync(path.join(homedir, '.enigma', 'addr-erc20.txt'), 'utf-8');
  let task;
  it('should execute compute task', async () => {
    const amount = 100000;
    const account_zero_private_key = '4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
    const account_one_private_key = '6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1';
    const keyPair0 = ec.keyFromPrivate(account_zero_private_key);
    const keyPair1 = ec.keyFromPrivate(account_one_private_key);
    const addr0 = web3.utils.keccak256(new Buffer.from(keyPair0.getPublic().encode("hex").substring(2), 'hex'));
    const addr1 = web3.utils.keccak256(new Buffer.from(keyPair1.getPublic().encode("hex").substring(2), 'hex'));

    // Sanity Checks
    expect(keyPair0.getPrivate().toString(16)).toEqual(account_zero_private_key);
    expect(keyPair1.getPrivate().toString(16)).toEqual(account_one_private_key);
    expect(addr0.slice(-40)).toString(utils.remove0x(accounts[0]));
    expect(addr1.slice(-40)).toString(utils.remove0x(accounts[1]));

    const msg = utils.hash(addr1,(new BN(amount).toString(16, 16)));
    const sig = EthCrypto.sign(account_zero_private_key, msg);

    let taskFn = 'mint(bytes32,bytes32,uint256,bytes)';
    let taskArgs = [
      [addr0,'bytes32'],
      [addr1,'bytes32'],
      [amount,'uint256'],
      [sig, 'bytes']
    ];
    let taskGasLimit = 20000000;
    let taskGasPx = utils.toGrains(1);
    task = await new Promise((resolve, reject) => {
      enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], erc20Addr)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    console.log(task);
  });

  it('should get the pending task', async () => {
    task = await enigma.getTaskRecordStatus(task);
    expect(task.ethStatus).toEqual(1);
  });

  it('should get the confirmed task', async () => {
    do {
      task = await enigma.getTaskRecordStatus(task);
      console.log(task.ethStatus);
      await sleep(1000);
    } while (task.ethStatus != 2);
    expect(task.ethStatus).toEqual(2);
  }, 10000);

  xit('should get the result', async () => {
    task = await new Promise((resolve, reject) => {
      enigma.getTaskResult(task)
        .on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    expect(task.engStatus).toEqual('SUCCESS');
    expect(task.encryptedAbiEncodedOutputs).toBeTruthy();
    expect(task.delta).toBeTruthy();
    expect(task.usedGas).toBeTruthy();
    expect(task.ethereumPayload).toBeTruthy();
    expect(task.ethereumAddress).toBeTruthy();
    expect(task.workerTaskSig).toBeTruthy();
  });

});
