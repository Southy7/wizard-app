(function attachUiComponents(root) {
  "use strict";

  function createSeatRoleBadge(label, role) {
    const badge = document.createElement("span");
    badge.className = `seat-role-badge ${role}`;
    badge.textContent = label;
    return badge;
  }

  function createPanel(title) {
    const panel = document.createElement("section");
    panel.className = "panel";

    if (title) {
      const heading = document.createElement("h3");
      heading.textContent = title;
      panel.append(heading);
    }

    return panel;
  }

  function createValueEntry({
    name,
    meta,
    badges = [],
    value,
    min,
    max,
    onChange,
    quickAction = null,
    colorIndex = null
  }) {
    const row = document.createElement("div");
    row.className = `entry-row${quickAction ? " has-quick-action" : ""}`;
    if (Number.isInteger(colorIndex)) {
      row.dataset.playerColor = String(colorIndex);
    }

    const info = document.createElement("div");
    if (badges.length > 0) info.className = "entry-player-info";
    const nameElement = document.createElement("span");
    nameElement.className = "entry-name";
    nameElement.textContent = name;
    info.append(nameElement);

    if (meta) {
      const metaElement = document.createElement("span");
      metaElement.className = "entry-meta";
      metaElement.textContent = meta;
      info.append(metaElement);
    }

    if (badges.length > 0) {
      const badgeContainer = document.createElement("span");
      badgeContainer.className = "entry-role-badges";
      badges.forEach(({ label, role }) => badgeContainer.append(createSeatRoleBadge(label, role)));
      info.append(badgeContainer);
    }

    const stepper = document.createElement("div");
    stepper.className = "value-stepper";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "value-button value-button-minus";
    minus.textContent = "−";
    minus.disabled = value <= min;
    minus.setAttribute("aria-label", `${name}: decrease value`);
    minus.addEventListener("click", () => onChange(value - 1));

    const display = document.createElement("span");
    display.className = "value-display";
    display.textContent = String(value);
    display.setAttribute("aria-label", `${name}: ${value}`);

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "value-button value-button-plus";
    plus.textContent = "+";
    plus.disabled = value >= max;
    plus.setAttribute("aria-label", `${name}: increase value`);
    plus.addEventListener("click", () => onChange(value + 1));

    stepper.append(minus, display, plus);

    const controls = document.createElement("div");
    controls.className = "entry-controls";

    if (quickAction) {
      const quickButton = createButton(
        quickAction.label,
        "button-secondary button-small correct-button",
        quickAction.onClick,
        Boolean(quickAction.disabled)
      );
      if (quickAction.title) quickButton.title = quickAction.title;
      if (quickAction.completed) quickButton.classList.add("correct");
      controls.append(quickButton);
    }

    controls.append(stepper);
    row.append(info, controls);
    return row;
  }

  function createStatusCard(type, title, text) {
    const card = document.createElement("div");
    card.className = `status-card ${type}`;
    const strong = document.createElement("strong");
    strong.textContent = title;
    card.append(strong);

    if (text) {
      const body = document.createElement("span");
      body.textContent = text;
      card.append(body);
    }
    return card;
  }

  function createSpecialButton(label, active) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `special-button${active ? " active" : ""}`;
    button.setAttribute("aria-pressed", String(active));

    const title = document.createElement("strong");
    title.textContent = label;
    button.append(title);
    return button;
  }

  function createButton(label, classNames, action, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button ${classNames}`;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", action);
    return button;
  }

  function numberCell(value, extraClass = "") {
    const cell = document.createElement("span");
    cell.className = `number${extraClass ? ` ${extraClass}` : ""}`;
    cell.textContent = String(value);
    return cell;
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  root.WizardUiComponents = Object.freeze({
    createSeatRoleBadge,
    createPanel,
    createValueEntry,
    createStatusCard,
    createSpecialButton,
    createButton,
    numberCell,
    openDialog,
    closeDialog
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
