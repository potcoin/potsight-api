'use strict';

var imports     = require('soop').imports();

var bitcore         = require('reddcore'),
    RpcClient       = bitcore.RpcClient,
    BitcoreBlock    = bitcore.Block,
	util            = require('util'),
    config          = require('../config/config');

var  bitcoreRpc  = imports.bitcoreRpc || new RpcClient(config.bitcoind);

function Rpc() {
}

Rpc._parseTxResult = function(info) {
  var b  = new Buffer(info.hex,'hex');

  // remove fields we don't need, to speed and adapt the information
  delete info.hex;

  // Inputs => add index + coinBase flag
  var n =0;
  info.vin.forEach(function(i) {
    i.n = n++;
    if (i.coinbase) info.isCoinBase = true;
    if (i.scriptSig) delete i.scriptSig.hex;
  });

  if (info.isCoinBase && info.vout.length > 0 && info.vout[0].value == 0) {
    // empty coinbase
    info.isCoinBaseEmpty = true;
  } else if (info.vin.length > 0 && (!info.vin[0].coinbase) && info.vout.length >=2 && info.vout[0].value == 0) {
    // coinstake marks vout[0] as empty
    info.isCoinStake = true;
    info.vout.splice(0, 1);
  }

  // Outputs => add total
  var valueOutSat = 0;
  info.vout.forEach( function(o) {
    o.value = o.value.toFixed(8);
    valueOutSat += o.value * bitcore.util.COIN;
    delete o.scriptPubKey.hex;
  });
  info.valueOut = valueOutSat.toFixed(0) / bitcore.util.COIN;
  info.size     = b.length;

  return info;
};


Rpc.errMsg = function(err) {
  var e = err;
  e.message += util.format(' [Host: %s:%d User:%s Using password:%s]',
                            bitcoreRpc.host,
                            bitcoreRpc.port,
                            bitcoreRpc.user,
                            bitcoreRpc.pass?'yes':'no'
                          );
  return e;
};

Rpc.getTxInfo = function(txid, doNotParse, cb) {
  var self = this;

  if (typeof doNotParse === 'function') {
    cb = doNotParse;
    doNotParse = false;
  }

  bitcoreRpc.getRawTransaction(txid, 1, function(err, txInfo) {
    // Not found?
    if (err && err.code === -5) return cb();
    if (err) return cb(self.errMsg(err));

    var info = doNotParse ? txInfo.result : self._parseTxResult(txInfo.result);
    return cb(null,info);
  });
};


Rpc.blockIndex = function(height, cb) {
  var self = this;

  bitcoreRpc.getBlockHash(height, function(err, bh){
    if (err) return cb(self.errMsg(err));
    cb(null, { blockHash: bh.result });
  });
};

Rpc.getBlock = function(hash, cb) {
  var self = this;

  bitcoreRpc.getBlock(hash, function(err,info) {
    // Not found?
    if (err && err.code === -5) return cb();
    if (err) return cb(self.errMsg(err));


    if (info.result.height)
      info.result.reward =  BitcoreBlock.getBlockValue(info.result.height, config.network) / bitcore.util.COIN ;

    return cb(err,info.result);
  });
};

Rpc.sendRawTransaction = function(rawtx, cb) {
  bitcoreRpc.sendRawTransaction(rawtx, function(err, txid) {
    if (err) return cb(err);

    return cb(err, txid.result);
  });
};

Rpc.verifyMessage = function(address, signature, message, cb) {
  var self = this;
  bitcoreRpc.verifyMessage(address, signature, message, function(err, message) {
    if (err && (err.code === -3 || err.code === -5))
      return cb(err);  // -3 = invalid address, -5 = malformed base64 / etc.
    if (err)
      return cb(self.errMsg(err));

    return cb(err, message.result);
  });
};

module.exports = require('soop')(Rpc);


