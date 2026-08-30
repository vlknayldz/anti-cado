"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough, Writable } = require("node:stream");
const { Prompts } = require("../src/prompts");

function ttyFixture() {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (value) => {
    input.isRaw = value;
  };
  let outputText = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      outputText += chunk.toString();
      callback();
    },
  });
  return { input, output, outputText: () => outputText };
}

test("D tuşu Enter beklemeden otomasyonu durdurur", async () => {
  const fixture = ttyFixture();
  const prompts = new Prompts(fixture.input, fixture.output);
  const waiting = prompts.waitForStop();
  fixture.input.write("d");
  await waiting;
  assert.equal(fixture.input.isRaw, false);
  prompts.close();
});

test("ESC tuşu Enter beklemeden otomasyonu durdurur", async () => {
  const fixture = ttyFixture();
  const prompts = new Prompts(fixture.input, fixture.output);
  const waiting = prompts.waitForStop();
  fixture.input.write("\u001b");
  await waiting;
  assert.equal(fixture.input.isRaw, false);
  prompts.close();
});

test("B tuşu çalışma sırasında başka kural başlatma komutu verir", async () => {
  const fixture = ttyFixture();
  const prompts = new Prompts(fixture.input, fixture.output);
  const command = prompts.waitForAutomationCommand();
  fixture.input.write("b");
  assert.equal(await command, "start_rule");
  prompts.close();
});

test("K tuşu çalışma sırasında kural durdurma komutu verir", async () => {
  const fixture = ttyFixture();
  const prompts = new Prompts(fixture.input, fixture.output);
  const command = prompts.waitForAutomationCommand();
  fixture.input.write("k");
  assert.equal(await command, "stop_rule");
  prompts.close();
});

test("virgülle birden fazla kural seçilebilir", async () => {
  const fixture = ttyFixture();
  const prompts = new Prompts(fixture.input, fixture.output);
  prompts.question = async () => "1,3";
  assert.deepEqual(await prompts.multiSelect("Kurallar", ["Bir", "İki", "Üç"]), [0, 2]);
  prompts.close();
});
