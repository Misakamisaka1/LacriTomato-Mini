import { describe, expect, it, vi } from "vitest";
import { startAreaCaptureWithHiddenPet } from "../../src/main/services/petHiddenCapture";

function createOverlay() {
  const listeners = new Map<string, () => void>();
  return {
    once: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
      return undefined;
    }),
    emit(event: string) {
      listeners.get(event)?.();
    },
  };
}

describe("pet-hidden screenshot capture flow", () => {
  it("hides a visible pet before starting screenshot capture and restores it after overlays close", async () => {
    const events: string[] = [];
    const petWindow = {
      isVisible: vi.fn(() => true),
      isDestroyed: vi.fn(() => false),
      hide: vi.fn(() => events.push("hide")),
      show: vi.fn(() => events.push("show")),
    };
    const overlayA = createOverlay();
    const overlayB = createOverlay();
    const screenshotService = {
      startAreaCapture: vi.fn(async () => {
        events.push("start-capture");
        return [overlayA, overlayB];
      }),
    };

    const overlays = await startAreaCaptureWithHiddenPet({
      petWindow,
      screenshotService,
      preloadPath: "dist/preload/index.cjs",
    });

    expect(overlays).toEqual([overlayA, overlayB]);
    expect(events).toEqual(["hide", "start-capture"]);
    expect(petWindow.hide).toHaveBeenCalledTimes(1);
    expect(petWindow.show).not.toHaveBeenCalled();

    overlayA.emit("closed");
    expect(petWindow.show).not.toHaveBeenCalled();
    overlayB.emit("closed");
    expect(petWindow.show).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["hide", "start-capture", "show"]);
  });

  it("does not show the pet after capture when it was already hidden", async () => {
    const petWindow = {
      isVisible: vi.fn(() => false),
      isDestroyed: vi.fn(() => false),
      hide: vi.fn(),
      show: vi.fn(),
    };
    const overlay = createOverlay();
    const screenshotService = {
      startAreaCapture: vi.fn(async () => [overlay]),
    };

    await startAreaCaptureWithHiddenPet({ petWindow, screenshotService, preloadPath: "preload.js" });
    overlay.emit("closed");

    expect(petWindow.hide).not.toHaveBeenCalled();
    expect(petWindow.show).not.toHaveBeenCalled();
  });

  it("leaves the pet visible when capture hiding is disabled", async () => {
    const petWindow = {
      isVisible: vi.fn(() => true),
      isDestroyed: vi.fn(() => false),
      hide: vi.fn(),
      show: vi.fn(),
    };
    const overlay = createOverlay();
    const screenshotService = {
      startAreaCapture: vi.fn(async () => [overlay]),
    };

    await startAreaCaptureWithHiddenPet({
      petWindow,
      screenshotService,
      preloadPath: "preload.js",
      hidePetWhenCapturing: false,
    });
    overlay.emit("closed");

    expect(petWindow.hide).not.toHaveBeenCalled();
    expect(petWindow.show).not.toHaveBeenCalled();
  });

  it("restores the pet if starting screenshot capture fails", async () => {
    const petWindow = {
      isVisible: vi.fn(() => true),
      isDestroyed: vi.fn(() => false),
      hide: vi.fn(),
      show: vi.fn(),
    };
    const screenshotService = {
      startAreaCapture: vi.fn(async () => {
        throw new Error("capture failed");
      }),
    };

    await expect(startAreaCaptureWithHiddenPet({ petWindow, screenshotService, preloadPath: "preload.js" }))
      .rejects.toThrow("capture failed");

    expect(petWindow.hide).toHaveBeenCalledTimes(1);
    expect(petWindow.show).toHaveBeenCalledTimes(1);
  });
});
