/**
 * A chat card's button that makes a roll once (sargas79/GWorldVTT#753).
 *
 * The button goes out of use while its roll is made, and stays out of use
 * once the roll was made, so nobody rolls the same check twice. A roll that
 * was never made -- refused below an effective 3, refused by a listener, or
 * not this user's to make -- gives the button back, so the card's roll can
 * still be made once whatever stood in its way is gone.
 *
 * The roll says it was not made by resolving to null or false; anything else,
 * `undefined` included, counts as made.
 */
export function rollOnce(button: HTMLButtonElement, roll: () => Promise<unknown>): () => Promise<void> {
  return async () => {
    if (button.disabled) return;
    button.disabled = true;
    let made = false;
    try {
      const result = await roll();
      made = result !== null && result !== false;
    } catch (error) {
      console.warn("gworld | a card's roll failed", error);
    } finally {
      if (!made) button.disabled = false;
    }
  };
}
