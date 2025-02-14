Solana
======

The Solana target requires `Solana <https://www.solana.com/>`_ v1.8.1.

Solana has the following differences to Ethereum Solidity:

- The address type is 32 bytes, not 20 bytes. This is what Solana calls an "account"
- An address literal has to be specified using the ``address"36VtvSbE6jVGGQytYWSaDPG7uZphaxEjpJHUUpuUbq4D"`` syntax
- There is no ``ecrecover()`` builtin function, but there is a ``signatureVerify()`` function which can check ed25519
  signatures.
- There is no concept of gas, so there is no gas functions
- Solana balance is stored in a ``uint64``, so *address* ``.balance``, ``.transfer()`` and ``.send()``
  all use ``uint64`` rather than ``uint256``.
- Solana uses different accounts for the program code, and the contract data.
- Programs are upgradable. There is no need to implement upgrades in Solidity.
- Solana provides different builtins, e.g. ``tx.program_id`` and ``tx.accounts``.
- Function selectors are eight bytes and known as *discriminators*.

This is how to build your Solidity for Solana:

.. code-block:: bash

  solang compile --target solana flipper.sol -v

This will produce two files called `flipper.json` and `flipper.so`. The former is an Anchor style IDL file and the latter is
the ELF BPF shared object containing the program. For each contract in the source code, Solang will create both an IDL file
and a binary file.

Each program will need to be deployed to a program_id. Usually, the program_id is a well-known account which is specified
in the Solidity source code using the `@program_id("F1ipperKF9EfD821ZbbYjS319LXYiBmjhzkkf5a26rC")` annotation on the contract.
A private key for the account is needed to deploy. You can generate your own private key using the command line tool
``solana-keygen``.

.. code-block:: bash

    echo "[4,10,246,143,43,1,234,17,159,249,41,16,230,9,198,162,107,221,233,124,34,15,16,57,205,53,237,217,149,17,229,195,3,150,242,90,91,222,117,26,196,224,214,105,82,62,237,137,92,67,213,23,14,206,230,155,43,36,85,254,247,11,226,145]" > flipper-keypair.json
    solana program deploy flipper.so

After deploying the program, you can start on the client side, which needs the anchor npm library:

.. code-block:: bash

    npm install @project-serum/anchor

Write the following javascript to a file called `flipper.js`.

.. code-block:: javascript

    const { readFileSync } = require('fs');
    const anchor = require('@project-serum/anchor');

    const IDL = JSON.parse(readFileSync('./flipper.json', 'utf8'));
    const PROGRAM_SO = readFileSync('./flipper.so');

    (async function () {
        const provider = anchor.AnchorProvider.env();

        const dataAccount = anchor.web3.Keypair.generate();

        const programId = new anchor.web3.PublicKey(IDL.metadata.address);

        const wallet = provider.wallet.publicKey;

        const program = new anchor.Program(IDL, programId, provider);

        await program.methods.new(wallet, true)
            .accounts({ dataAccount: dataAccount.publicKey })
            .signers([dataAccount]).rpc();

        const val1 = await program.methods.get()
            .accounts({ dataAccount: dataAccount.publicKey })
            .view();

        console.log(`state: ${val1}`);

        await program.methods.flip()
            .accounts({ dataAccount: dataAccount.publicKey })
            .rpc();

        const val2 = await program.methods.get()
            .accounts({ dataAccount: dataAccount.publicKey })
            .view();

        console.log(`state: ${val2}`);
    })();

Now you'll have to set the `ANCHOR_WALLET` and `ANCHOR_PROVIDER_URL` environment variables to the correct values in order to run the example.

.. code-block:: bash

    export ANCHOR_WALLET=$HOME/.config/solana/id.json
    export ANCHOR_PROVIDER_URL=http://127.0.0.1:8899
    node flipper.js

For more examples, see the
`solang's integration tests <https://github.com/hyperledger/solang/tree/main/integration/solana>`_.

Using the Anchor client library
_______________________________

Some notes on using the anchor javascript npm library.

* Solidity function names are converted to camelCase. This means that if in Solidity a function is called ``foo_bar()``,
  you must write ``fooBar()`` in your javascript.
* Anchor only allows you to call ``.view()`` on Solidity functions which are declared ``view`` or ``pure``.
* Named return values in Solidity are also converted to camelCase. Unnamed returned are given the name ``return0``, ``return1``, etc,
  depending on the position in the returns values.
* Only return values from ``view`` and ``pure`` functions can be decoded. Return values from other functions and are not accessible.
  This is a limitation in the Anchor library. Possibly this can be fixed.
* In the case of an error, no return data is decoded. This means that the reason provided in ``revert('reason');`` is not
  available as a return value.
* Number arguments for functions are expressed as ``BN`` values and not plain javascript ``Number`` or ``BigInt``.

.. _call_anchor:

Calling Anchor Programs from Solidity
_____________________________________

It is possible to call `Anchor Programs <https://github.com/coral-xyz/anchor>`_
from Solidity. You first have to generate a Solidity interface file from the IDL file using
the :ref:`idl_command`. Then, import the Solidity file in your Solidity using the
``import "...";`` syntax. Say you have an anchor program called `bobcat` with a
function `pounce`, you can call it like so:

.. include:: ../examples/solana/call_anchor.sol
  :code: solidity

Setting the program_id for a contract
_____________________________________

When developing contracts for Solana, programs are usually deployed to a well
known account. The account can be specified in the source code using an annotation
``@program_id``. If you want to instantiate a contract using the
``new ContractName()`` syntax, then the contract must have a program_id annotation.

.. include:: ../examples/solana/program_id.sol
  :code: solidity

.. note::

    The program_id `Foo5mMfYo5RhRcWa4NZ2bwFn4Kdhe8rNK5jchxsKrivA` was generated using
    the command line:

    .. code-block:: bash

        solana-keygen grind --starts-with Foo:1

Setting the payer, seeds, bump, and space for a contract
_________________________________________________________

When a contract is instantiated, there are two accounts required: the program account to hold
the executable code and the data account to save the state variables of the contract. The
program account is deployed once and can be reused for updating the contract. When each
Solidity contract is instantiated (also known as deployed), the data account has to be
created. This can be done by the client-side code, and then the created blank account
is passed to the transaction that runs the constructor code.

Alternatively, the data account can be created by the constructor, on chain. When
this method is used, some parameters must be specified for the account
using annotations. Those are placed before the constructor. If there is no
constructor present, then an empty constructor can be added. The constructor
arguments can be used in the annotations.

.. include:: ../examples/solana/constructor_annotations.sol
  :code: solidity

Creating an account needs a payer, so at a minimum the ``@payer`` annotation must be
specified. If it is missing, then the data account must be created client-side.
The ``@payer`` requires an address. This can be a constructor argument or
an address literal.

The size of the data account can be specified with ``@space``. This is a
``uint64`` expression which can either be a constant or use one of the constructor
arguments. The ``@space`` should at least be the size given when you run ``solang -v``:

.. code-block:: bash

    $ solang compile --target solana -v examples/flipper.sol
    ...
    info: contract flipper uses at least 17 bytes account data
    ...

If the data account is going to be a
`program derived address <https://docs.solana.com/developing/programming-model/calling-between-programs#program-derived-addresses>`_,
then the seeds and bump have to be provided. There can be multiple seeds, and an optional
single bump. If the bump is not provided, then the seeds must not create an
account that falls on the curve. The ``@seed`` can be a string literal,
or a hex string with the format ``hex"4142"``, or a constructor argument of type
``bytes``. The ``@bump`` must a single byte of type ``bytes1``.

.. _value_transfer:

Transfering native value with a function call
_____________________________________________

The Solidity langauge on Ethereum allows value transfers with an external call
or constructor, using the ``auction.bid{value: 501}()`` syntax.
Solana Cross Program Invocation (CPI) does not support this. This means that:

 - Specifying ``value:`` on an external call or constructor is not permitted
 - The ``payable`` keyword has no effect
 - ``msg.value`` is not supported

.. note::

    A naive way to implement this is to let the caller transfer
    native balance and then inform the callee about the amount transferred by
    specifying this in the instruction data. However, it would be trivial to
    forge such an operation.

Receive function
________________

In Solidity the ``receive()`` function, when defined, is called whenever the native
balance for an account gets credited, for example through a contract calling
``account.transfer(value);``. On Solana, there is no method that implement
this. The balance of an account can be credited without any code being executed.

``receive()`` functions are not permitted on the Solana target.

.. _msg_sender_solana:

``msg.sender`` not available on Solana
______________________________________

On Ethereum, ``msg.sender`` is used to identify either the account that submitted
the transaction, or the caller when one contract calls another. On Ethereum, each
contract execution can only use a single account, which provides the code and data.
On Solana, each contract execution uses many accounts. Consider a rust contract which
calls a Solidity contract: the rust contract can access a few data accounts, and which
of those would be considered the caller? So in many cases there is not a single account
which can be identified as a caller. In addition to that, the Solana VM has no
mechanism for fetching the caller accounts. This means there is no way to implement
``msg.sender``.

The way to implement this on Solana is to have an authority account for the contract
that must be a signer for the transaction (note that on Solana there
can be many signers too). This is a common construct on Solana contracts.

.. include:: ../examples/solana/use_authority.sol
  :code: solidity

Builtin Imports
________________

Some builtin functionality is only available after importing. The following structs
can be imported via the special builtin import file ``solana``.

.. code-block:: solidity

    import {AccountMeta, AccountInfo} from 'solana';

Note that ``{AccountMeta, AccountInfo}`` can be omitted, renamed or imported via
import object.

.. code-block:: solidity

    // Now AccountMeta will be known as AM
    import {AccountMeta as AM} from 'solana';

    // Now AccountMeta will be available as solana.AccountMeta
    import 'solana' as solana;

.. note::

    The import file ``solana`` is only available when compiling for the Solana
    target.

.. _account_info:

Builtin AccountInfo
+++++++++++++++++++

The account info of all the accounts passed into the transaction. ``AccountInfo`` is a builtin
structure with the following fields:

address ``key``
    The address (or public key) of the account

uint64 ``lamports``
    The lamports of the accounts. This field can be modified, however the lamports need to be
    balanced for all accounts by the end of the transaction.

bytes ``data```
    The account data. This field can be modified, but use with caution.

address ``owner``
    The program that owns this account

uint64 ``rent_epoch``
    The next epoch when rent is due.

bool ``is_signer``
    Did this account sign the transaction

bool ``is_writable``
    Is this account writable in this transaction

bool ``executable``
    Is this account a program

.. _account_meta:

Builtin AccountMeta
+++++++++++++++++++

When doing an external call (aka CPI), ``AccountMeta`` specifies which accounts
should be passed to the callee.

address ``pubkey``
    The address (or public key) of the account

bool ``is_writable``
    Can the callee write to this account

bool ``is_signer``
    Can the callee assume this account signed the transaction

Builtin create_program_address
++++++++++++++++++++++++++++++

This function returns the program derived address for a program address and
the provided seeds. See the Solana documentation on
`program derived adddresses <https://edge.docs.solana.com/developing/programming-model/calling-between-programs#program-derived-addresses>`_.

.. include:: ../examples/solana/builtin_create_program_address.sol
  :code: solidity

Builtin try_find_program_address
++++++++++++++++++++++++++++++++

This function returns the program derived address for a program address and
the provided seeds, along with a seed bump. See the Solana documentation on
`program derived adddresses <https://edge.docs.solana.com/developing/programming-model/calling-between-programs#program-derived-addresses>`_.

.. include:: ../examples/solana/builtin_try_find_program_address.sol
  :code: solidity

Solana Library
______________

In Solang's Github repository, there is a directory called ``solana-library``. It contains libraries for Solidity contracts
to interact with Solana specific instructions. We provide two libraries: one for SPL tokens and another
for Solana's system instructions. In order to use those functionalities, copy the correspondent library
file to your project and import it.

SPL-token
+++++++++

`spl-token <https://spl.solana.com/token>`_ is the Solana native way of creating tokens, minting, burning and
transferring token. This is the Solana equivalent of
`ERC-20 <https://ethereum.org/en/developers/docs/standards/tokens/erc-20/>`_ and
`ERC-721 <https://ethereum.org/en/developers/docs/standards/tokens/erc-721/>`_. Solang's repository contains
a library ``SplToken`` to use spl-token from Solidity. The file
`spl_token.sol <https://github.com/hyperledger/solang/blob/main/solana-library/spl_token.sol>`_  should be copied into
your source tree, and then imported in your solidity files where it is required. The ``SplToken`` library has doc
comments explaining how it should be used.

There is an example in our integration tests of how this should be used. See
`token.sol <https://github.com/hyperledger/solang/blob/main/integration/solana/token.sol>`_ and
`token.spec.ts <https://github.com/hyperledger/solang/blob/main/integration/solana/token.spec.ts>`_.

System Instructions
+++++++++++++++++++

Solana's system instructions enables developers to interact with Solana's System Program. There are functions to
create new accounts, allocate account data, assign accounts to owning programs, transfer lamports from System Program
owned accounts and pay transaction fees. More information about the functions offered can be found both on
`Solana documentation <https://docs.rs/solana-program/1.11.10/solana_program/system_instruction/enum.SystemInstruction.html>`_
and on Solang's `system_instruction.sol <https://github.com/hyperledger/solang/blob/main/solana-library/system_instruction.sol>`_ file.

The usage of system instructions needs the correct setting of writable and signer accounts when interacting with Solidity
contracts on chain. Examples are available on Solang's integration tests.
See `system_instruction_example.sol <https://github.com/hyperledger/solang/blob/main/integration/solana/system_instruction_example.sol>`_
and `system_instruction.spec.ts <https://github.com/hyperledger/solang/blob/main/integration/solana/system_instruction.spec.ts>`_
