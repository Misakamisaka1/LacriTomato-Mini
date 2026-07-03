export interface HiddenPetWindow {
  isVisible(): boolean;
  isDestroyed(): boolean;
  hide(): void;
  show(): void;
}

export interface CaptureOverlayWindow {
  once(event: "closed", listener: () => void): unknown;
}

export interface AreaCaptureStarter {
  startAreaCapture(preloadPath: string): Promise<CaptureOverlayWindow[]>;
}

export interface StartAreaCaptureWithHiddenPetOptions {
  petWindow: HiddenPetWindow;
  screenshotService: AreaCaptureStarter;
  preloadPath: string;
  hidePetWhenCapturing?: boolean;
}

function restorePetWindow(petWindow: HiddenPetWindow) {
  if (!petWindow.isDestroyed()) {
    petWindow.show();
  }
}

export async function startAreaCaptureWithHiddenPet({
  petWindow,
  screenshotService,
  preloadPath,
  hidePetWhenCapturing = true,
}: StartAreaCaptureWithHiddenPetOptions) {
  const shouldRestorePet = hidePetWhenCapturing && petWindow.isVisible();
  if (shouldRestorePet) {
    petWindow.hide();
  }

  try {
    const overlayWindows = await screenshotService.startAreaCapture(preloadPath);
    if (!shouldRestorePet) {
      return overlayWindows;
    }

    if (overlayWindows.length === 0) {
      restorePetWindow(petWindow);
      return overlayWindows;
    }

    let remainingWindows = overlayWindows.length;
    const restoreAfterAllOverlaysClose = () => {
      remainingWindows -= 1;
      if (remainingWindows <= 0) {
        restorePetWindow(petWindow);
      }
    };

    overlayWindows.forEach((window) => {
      window.once("closed", restoreAfterAllOverlaysClose);
    });

    return overlayWindows;
  } catch (error) {
    if (shouldRestorePet) {
      restorePetWindow(petWindow);
    }
    throw error;
  }
}
