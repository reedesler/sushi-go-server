import {
  calculateFinalPuddingScores,
  calculateGroupScores,
  calculateIndividualScore,
  dumplingScore,
  getMakiScore,
  nigiriScore,
  sashimiScore,
  tempuraScore,
} from "../src/game/Game";
import { getTopTwo } from "../src/util";
import { Card } from "../src/ApiTypes";

describe("Get maki score", () => {
  test("empty array", () => expect(getMakiScore([])).toBe(0));
  test("has makis", () => expect(getMakiScore(["maki1", "maki3", "maki2"])).toBe(6));
  test("has mix", () =>
    expect(getMakiScore(["pudding", "dumpling", "maki3", "chopsticks", "maki3", "maki1"])).toBe(7));
});

describe("getTopTwo", () => {
  test.each([
    [[0, 1, 2, 3], { first: 3, second: 2 }],
    [[3, 2, 1, 0], { first: 3, second: 2 }],
    [[3, 3, 3, 3, 3], { first: 3, second: 0 }],
    [[3, 3, 3, 1, 0], { first: 3, second: 1 }],
    [[3, 1, 1, 0], { first: 3, second: 1 }],
    [[3, 1, 3, 1, 0], { first: 3, second: 1 }],
  ])("%p", (arr, expected) => expect(getTopTwo(arr)).toEqual(expected));
});

describe("Get group maki scores", () => {
  test("everyone has no makis", () =>
    expect(
      calculateGroupScores([
        { id: "a", playerState: { cards: ["pudding", "chopsticks", "nigiri2"] } },
        { id: "b", playerState: { cards: ["wasabi", "nigiri1", "dumpling"] } },
        { id: "c", playerState: { cards: ["sashimi", "tempura", "dumpling"] } },
      ]),
    ).toEqual({ a: 0, b: 0, c: 0 }));

  test("one person has some makis", () =>
    expect(
      calculateGroupScores([
        { id: "a", playerState: { cards: ["pudding", "chopsticks", "maki1"] } },
        { id: "b", playerState: { cards: ["wasabi", "nigiri1", "dumpling"] } },
        { id: "c", playerState: { cards: ["sashimi", "tempura", "dumpling"] } },
      ]),
    ).toEqual({ a: 6, b: 0, c: 0 }));

  test("multiple people have same makis, others none", () =>
    expect(
      calculateGroupScores([
        { id: "a", playerState: { cards: ["pudding", "chopsticks", "maki1"] } },
        { id: "b", playerState: { cards: ["wasabi", "maki1", "dumpling"] } },
        { id: "c", playerState: { cards: ["sashimi", "tempura", "dumpling"] } },
      ]),
    ).toEqual({ a: 3, b: 3, c: 0 }));

  test("everyone has different makis", () =>
    expect(
      calculateGroupScores([
        { id: "a", playerState: { cards: ["pudding", "maki3", "maki1"] } },
        { id: "b", playerState: { cards: ["wasabi", "maki1", "dumpling"] } },
        { id: "c", playerState: { cards: ["sashimi", "tempura", "dumpling"] } },
      ]),
    ).toEqual({ a: 6, b: 3, c: 0 }));

  test("two people tie for first", () =>
    expect(
      calculateGroupScores([
        { id: "a", playerState: { cards: ["pudding", "maki3", "nigiri1"] } },
        { id: "b", playerState: { cards: ["wasabi", "maki3", "dumpling"] } },
        { id: "c", playerState: { cards: ["sashimi", "maki1", "dumpling"] } },
      ]),
    ).toEqual({ a: 3, b: 3, c: 0 }));

  test("three people tie for first", () =>
    expect(
      calculateGroupScores([
        { id: "a", playerState: { cards: ["pudding", "maki3", "nigiri1"] } },
        { id: "b", playerState: { cards: ["wasabi", "maki3", "dumpling"] } },
        { id: "c", playerState: { cards: ["sashimi", "maki3", "dumpling"] } },
      ]),
    ).toEqual({ a: 2, b: 2, c: 2 }));

  test("two people tie for second", () =>
    expect(
      calculateGroupScores([
        { id: "a", playerState: { cards: ["pudding", "maki3", "nigiri1"] } },
        { id: "b", playerState: { cards: ["wasabi", "maki1", "dumpling"] } },
        { id: "c", playerState: { cards: ["sashimi", "maki1", "dumpling"] } },
      ]),
    ).toEqual({ a: 6, b: 1, c: 1 }));
});

describe("Get tempura score", () => {
  test("no tempura", () =>
    expect(tempuraScore(["maki3", "pudding", "dumpling", "sashimi", "nigiri1"])).toBe(0));

  test("one tempura", () =>
    expect(tempuraScore(["maki3", "pudding", "tempura", "sashimi", "nigiri1"])).toBe(0));

  test("two tempura", () =>
    expect(tempuraScore(["maki3", "pudding", "tempura", "sashimi", "tempura"])).toBe(5));

  test("three tempura", () =>
    expect(tempuraScore(["tempura", "pudding", "tempura", "sashimi", "tempura"])).toBe(5));

  test("four tempura", () =>
    expect(tempuraScore(["tempura", "tempura", "tempura", "sashimi", "tempura"])).toBe(10));
});

describe("Get sashimi score", () => {
  test("no sashimi", () =>
    expect(sashimiScore(["maki3", "pudding", "dumpling", "tempura", "nigiri1"])).toBe(0));

  test("one sashimi", () =>
    expect(sashimiScore(["maki3", "pudding", "tempura", "sashimi", "nigiri1"])).toBe(0));

  test("two sashimi", () =>
    expect(sashimiScore(["maki3", "pudding", "sashimi", "sashimi", "tempura"])).toBe(0));

  test("three sashimi", () =>
    expect(sashimiScore(["sashimi", "pudding", "sashimi", "sashimi", "tempura"])).toBe(10));

  test("four sashimi", () =>
    expect(sashimiScore(["sashimi", "sashimi", "sashimi", "sashimi", "tempura"])).toBe(10));

  test("five sashimi", () =>
    expect(sashimiScore(["sashimi", "sashimi", "sashimi", "sashimi", "sashimi"])).toBe(10));

  test("six sashimi", () =>
    expect(sashimiScore(["sashimi", "sashimi", "sashimi", "sashimi", "sashimi", "sashimi"])).toBe(
      20,
    ));
});

describe("Get dumpling score", () => {
  test("no dumplings", () =>
    expect(dumplingScore(["maki3", "pudding", "sashimi", "tempura", "nigiri1"])).toBe(0));

  test("one dumpling", () =>
    expect(dumplingScore(["maki3", "dumpling", "sashimi", "tempura", "nigiri1"])).toBe(1));

  test("two dumplings", () =>
    expect(dumplingScore(["maki3", "dumpling", "sashimi", "dumpling", "nigiri1"])).toBe(3));

  test("three dumplings", () =>
    expect(dumplingScore(["maki3", "dumpling", "sashimi", "dumpling", "dumpling"])).toBe(6));

  test("four dumplings", () =>
    expect(dumplingScore(["dumpling", "dumpling", "dumpling", "dumpling", "nigiri1"])).toBe(10));

  test("five dumplings", () =>
    expect(dumplingScore(["dumpling", "dumpling", "dumpling", "dumpling", "dumpling"])).toBe(15));

  test("six dumplings", () =>
    expect(
      dumplingScore(["dumpling", "dumpling", "dumpling", "dumpling", "dumpling", "dumpling"]),
    ).toBe(15));
});

describe("Get nigiri score", () => {
  test("no nigiris or wasabi", () =>
    expect(nigiriScore(["dumpling", "sashimi", "maki2", "pudding", "tempura"])).toBe(0));

  test("no nigiris", () =>
    expect(nigiriScore(["dumpling", "sashimi", "wasabi", "pudding", "tempura"])).toBe(0));

  test("no wasabi", () =>
    expect(nigiriScore(["dumpling", "nigiri3", "maki2", "nigiri2", "nigiri1"])).toBe(6));

  test("one wasabi", () =>
    expect(nigiriScore(["dumpling", "nigiri3", "wasabi", "nigiri2", "nigiri1"])).toBe(10));

  test("wasabi after", () =>
    expect(nigiriScore(["dumpling", "nigiri3", "nigiri2", "nigiri1", "wasabi"])).toBe(6));

  test("bank wasabi", () =>
    expect(nigiriScore(["wasabi", "wasabi", "wasabi", "tempura", "nigiri3", "nigiri1"])).toBe(12));

  test("wasabi before and after", () =>
    expect(nigiriScore(["maki1", "wasabi", "nigiri3", "nigiri2", "nigiri1", "wasabi"])).toBe(12));
});

test("Get individual score", () =>
  expect(
    calculateIndividualScore([
      "tempura",
      "maki2",
      "pudding",
      "dumpling",
      "wasabi",
      "sashimi",
      "chopsticks",
      "tempura",
      "nigiri2",
      "dumpling",
      "nigiri3",
    ]),
  ).toBe(17));

describe("Get pudding scores", () => {
  test("all 0 pudding", () =>
    expect(
      calculateFinalPuddingScores([
        { id: "a", playerState: { puddings: 0 } },
        { id: "b", playerState: { puddings: 0 } },
        { id: "c", playerState: { puddings: 0 } },
      ]),
    ).toEqual({ a: 0, b: 0, c: 0 }));

  test("all same pudding", () =>
    expect(
      calculateFinalPuddingScores([
        { id: "a", playerState: { puddings: 5 } },
        { id: "b", playerState: { puddings: 5 } },
        { id: "c", playerState: { puddings: 5 } },
      ]),
    ).toEqual({ a: 0, b: 0, c: 0 }));

  test("first and last", () =>
    expect(
      calculateFinalPuddingScores([
        { id: "a", playerState: { puddings: 5 } },
        { id: "b", playerState: { puddings: 2 } },
        { id: "c", playerState: { puddings: 0 } },
      ]),
    ).toEqual({ a: 6, b: 0, c: -6 }));

  test("share first", () =>
    expect(
      calculateFinalPuddingScores([
        { id: "a", playerState: { puddings: 5 } },
        { id: "b", playerState: { puddings: 5 } },
        { id: "c", playerState: { puddings: 0 } },
      ]),
    ).toEqual({ a: 3, b: 3, c: -6 }));

  test("share last", () =>
    expect(
      calculateFinalPuddingScores([
        { id: "a", playerState: { puddings: 5 } },
        { id: "b", playerState: { puddings: 0 } },
        { id: "c", playerState: { puddings: 0 } },
        { id: "d", playerState: { puddings: 0 } },
        { id: "e", playerState: { puddings: 0 } },
      ]),
    ).toEqual({ a: 6, b: -1, c: -1, d: -1, e: -1 }));

  test("no last for 2 player game", () =>
    expect(
      calculateFinalPuddingScores([
        { id: "a", playerState: { puddings: 5 } },
        { id: "b", playerState: { puddings: 2 } },
      ]),
    ).toEqual({ a: 6, b: 0 }));
});
