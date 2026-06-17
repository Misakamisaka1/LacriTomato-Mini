import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PetHeadMenu } from "../../src/renderer/components/PetHeadMenu";

describe("PetHeadMenu", () => {
  it("renders plugin menu items as animated keys", async () => {
    const onAction = vi.fn();
    render(
      <PetHeadMenu
        open
        items={[
          { id: "translator.open", label: "翻译", action: "translator.open", icon: "Languages" },
          { id: "screenshot.capture", label: "截图", action: "screenshot.capture", icon: "ScanLine" },
        ]}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "翻译" }));
    expect(onAction).toHaveBeenCalledWith("translator.open");
  });
});
