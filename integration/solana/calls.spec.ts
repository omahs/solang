import expect from 'expect';
import { establishConnection } from './index';
import crypto from 'crypto';

describe('Deploy solang contract and test', () => {
    it('external_call', async function () {
        this.timeout(50000);

        let conn = await establishConnection();

        let caller = await conn.loadProgram("caller.so", "caller.abi");
        let callee = await conn.loadProgram("callee.so", "callee.abi");
        let callee2 = await conn.loadProgram("callee2.so", "callee2.abi");

        // call the constructor
        await caller.call_constructor(conn, []);
        await callee.call_constructor(conn, []);
        await callee2.call_constructor(conn, []);

        await callee.call_function(conn, "set_x", ["102"]);

        let res = await callee.call_function(conn, "get_x", []);

        expect(res["0"]).toBe("102");

        let address_callee = '0x' + callee.get_storage_key().toBuffer().toString('hex');
        let address_callee2 = '0x' + callee2.get_storage_key().toBuffer().toString('hex');
        console.log("addres: " + address_callee);

        await caller.call_function(conn, "do_call", [address_callee, "13123"], callee.all_keys());

        res = await callee.call_function(conn, "get_x", []);

        expect(res["0"]).toBe("13123");

        res = await caller.call_function(conn, "do_call2", [address_callee, "20000"], callee.all_keys());

        expect(res["0"]).toBe("33123");

        let all_keys = callee.all_keys()

        all_keys.push(...callee2.all_keys());

        res = await caller.call_function(conn, "do_call3", [address_callee, address_callee2, ["3", "5", "7", "9"], "yo"], all_keys);

        expect(res["0"]).toBe("24");
        expect(res["1"]).toBe("my name is callee");

        res = await caller.call_function(conn, "do_call4", [address_callee, address_callee2, ["1", "2", "3", "4"], "asda"], all_keys);

        expect(res["0"]).toBe("10");
        expect(res["1"]).toBe("x:asda");
    });
});
