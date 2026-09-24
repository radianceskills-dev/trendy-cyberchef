/* eslint-disable */
import test from "node:test";
import assert from "node:assert/strict";
import {normalizeRecipe, parseRecipeResponse} from "../../src/web/trendy-ai/RecipeSchema.mjs";

const live = {"From Base64":{args:[{},{},{}]},"SHA2":{args:[{},{},{}]},"Find / Replace":{args:[{},{},{},{},{},{}]},"Encode text":{args:[{value:["UTF-8 (65001)","UTF-16LE (1200)"]}]}};

test("translates named arguments",()=>{const recipe=normalizeRecipe({version:1,title:"Decode and hash",steps:[{operation:"From Base64",arguments:{}},{operation:"SHA2",arguments:{size:"256"}}],warnings:[]},live);assert.deepEqual(recipe.config,[{op:"From Base64",args:["A-Za-z0-9+/=",true,false]},{op:"SHA2",args:["256",64,160]}])});
test("accepts CyberChef ingredient labels",()=>{const recipe=normalizeRecipe({version:1,title:"Decode",steps:[{operation:"From Base64",arguments:{Alphabet:"A-Za-z0-9+/=","Remove non-alphabet chars":true,"Strict mode":false}}]},live);assert.deepEqual(recipe.config[0].args,["A-Za-z0-9+/=",true,false])});
test("builds toggle strings",()=>{const recipe=normalizeRecipe({version:1,title:"Replace",steps:[{operation:"Find / Replace",arguments:{find:"token",replace:"value",mode:"Simple string"}}]},live);assert.deepEqual(recipe.config[0].args[0],{option:"Simple string",string:"token"})});
test("rejects unsupported content",()=>{assert.throws(()=>normalizeRecipe({version:1,title:"Bad",steps:[{operation:"AES Encrypt",arguments:{}}]},live),/not supported/);assert.throws(()=>normalizeRecipe({version:1,title:"Bad",steps:[{operation:"SHA2",arguments:{secret:"x"}}]},live),/not allowed/)});
test("validates live options",()=>assert.throws(()=>normalizeRecipe({version:1,title:"Encode",steps:[{operation:"Encode text",arguments:{encoding:"Unknown"}}]},live),/must be one of/));
test("rejects wrapped or malformed JSON",()=>{assert.throws(()=>parseRecipeResponse("```json\n{}\n```"),/raw JSON/);assert.throws(()=>parseRecipeResponse("{bad"),/malformed JSON/)});
