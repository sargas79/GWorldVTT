import { describe, expect, it } from "vitest";

import { TOWING_LIMIT_BL, canPull, towedWeight, wheelchairMove } from "../towing.js";

describe("pulling and dragging (Campaigns p. 353)", () => {
  it("counts a dragged load at its full weight, less on runners or wheels, and half again on a smooth surface", () => {
    expect(towedWeight({ weight: 400 })).toBe(400);
    expect(towedWeight({ weight: 400, conveyance: "sledge" })).toBe(200);
    expect(towedWeight({ weight: 400, conveyance: "cart" })).toBe(40);
    expect(towedWeight({ weight: 400, conveyance: "wagon" })).toBe(20);
    expect(towedWeight({ weight: 400, conveyance: "wagon", smooth: true })).toBe(10);
    expect(towedWeight({ weight: 400, smooth: true })).toBe(200);
    expect(towedWeight({ weight: -5 })).toBe(0);
  });

  it("can't move an effective weight past 15 x Basic Lift", () => {
    expect(TOWING_LIMIT_BL).toBe(15);
    expect(canPull(300, 20)).toBe(true);
    expect(canPull(301, 20)).toBe(false);
  });
});

describe("a muscle-powered wheelchair (Characters p. 142)", () => {
  it("moves at a quarter of ST, rounded down", () => {
    expect(wheelchairMove(10)).toBe(2);
    expect(wheelchairMove(15)).toBe(3);
    expect(wheelchairMove(3)).toBe(0);
  });
});
