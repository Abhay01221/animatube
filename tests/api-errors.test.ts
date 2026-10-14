import test from "node:test";
import assert from "node:assert/strict";
import { apiError } from "../lib/server-auth";

test("missing migration gives an actionable response without exposing database details",async()=>{
  for(const code of ["P2021","P2022"]){
    const response=apiError({code,message:"database connection credentials"});
    assert.equal(response.status,503);
    const body=await response.json();assert.match(body.error,/npm run db:setup/);
    assert.doesNotMatch(body.error,/credentials/);
  }
});
