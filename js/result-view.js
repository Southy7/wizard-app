(function attachResultView(root) {
  "use strict";

  const Formatters = root.WizardFormatters;
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

  function renderRanking(container, gameState, totals) {
    const ranking = getRankedPlayers(gameState, totals);

    container.replaceChildren();
    // Use competition ranking: tied players share a place and the following place is skipped.
    let displayedPosition = 0;
    let previousPoints = null;
    const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };

    ranking.forEach((entry, index) => {
      if (entry.points !== previousPoints) displayedPosition = index + 1;
      previousPoints = entry.points;
      if (displayedPosition > 3) return;

      const row = document.createElement("div");
      row.className = "ranking-row";
      row.dataset.rank = String(displayedPosition);
      row.dataset.playerColor = String(gameState.players.findIndex((player) => player.id === entry.player.id) + 1);

      const position = document.createElement("span");
      position.className = "ranking-position";
      position.textContent = medals[displayedPosition] ?? String(displayedPosition);
      position.setAttribute("aria-label", `Place ${displayedPosition}`);

      const name = document.createElement("span");
      name.className = "ranking-name";
      name.textContent = Formatters.getPlayerDisplayName(gameState, entry.player.id);

      const points = document.createElement("span");
      points.className = "ranking-points";
      points.textContent = `${Formatters.formatNumber(entry.points)} Points`;

      row.append(position, name, points);
      container.append(row);
    });
  }

  function renderScoreHistory(container, completedRounds, totals, gameState) {
    container.replaceChildren();
    const rankedPlayers = getRankedPlayers(gameState, totals);

    const table = document.createElement("table");
    table.className = "history-table";

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const roundHead = document.createElement("th");
    roundHead.scope = "col";
    roundHead.textContent = "Round";
    headRow.append(roundHead);

    rankedPlayers.forEach(({ player, originalIndex }) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.dataset.playerColor = String(originalIndex + 1);
      th.textContent = Formatters.getPlayerDisplayName(gameState, player.id, originalIndex);
      headRow.append(th);
    });
    head.append(headRow);

    const body = document.createElement("tbody");
    completedRounds.forEach((round) => {
      const row = document.createElement("tr");
      const roundCell = document.createElement("th");
      roundCell.scope = "row";
      roundCell.textContent = String(round.number);
      row.append(roundCell);

      rankedPlayers.forEach(({ player, originalIndex }) => {
        const points = Number(round.playerResults?.[player.id]?.roundPoints) || 0;
        const cell = document.createElement("td");
        cell.dataset.playerColor = String(originalIndex + 1);
        cell.className = points >= 0 ? "positive" : "negative";
        cell.append(createHistoryScoreNumber(points, true));
        row.append(cell);
      });
      body.append(row);
    });

    const foot = document.createElement("tfoot");
    const totalRow = document.createElement("tr");
    const totalLabel = document.createElement("th");
    totalLabel.scope = "row";
    totalLabel.textContent = "Total";
    totalRow.append(totalLabel);
    const leadingTotal = rankedPlayers[0]?.points ?? 0;
    rankedPlayers.forEach(({ originalIndex, points }) => {
      const cell = document.createElement("td");
      cell.dataset.playerColor = String(originalIndex + 1);
      cell.append(createHistoryScoreNumber(points, false));
      if (points === leadingTotal) cell.classList.add("leader-total");
      totalRow.append(cell);
    });
    foot.append(totalRow);

    table.append(head, body, foot);
    container.append(table);
  }

  function createHistoryScoreNumber(value, showPositiveSign) {
    const number = Number(value) || 0;
    const wrapper = document.createElement("span");
    wrapper.className = "history-score-number";
    wrapper.setAttribute(
      "aria-label",
      showPositiveSign ? Formatters.formatSigned(number) : Formatters.formatNumber(number)
    );

    const magnitude = document.createElement("span");
    magnitude.className = "history-score-magnitude";
    magnitude.setAttribute("aria-hidden", "true");
    magnitude.textContent = String(Math.abs(number));

    const hasVisibleSign = number < 0 || (showPositiveSign && number > 0);
    if (hasVisibleSign) {
      const sign = document.createElement("span");
      sign.className = "history-score-sign";
      sign.setAttribute("aria-hidden", "true");
      sign.textContent = number < 0 ? "\u2212" : "+";
      wrapper.append(sign);
    }
    wrapper.append(magnitude);
    return wrapper;
  }

  function renderScoreProgress(container, completedRounds, gameState) {
    container.replaceChildren();

    const rounds = [...completedRounds].sort((a, b) => a.number - b.number);
    const series = gameState.players.map((player, originalIndex) => {
      let total = 0;
      const values = [0];
      rounds.forEach((round) => {
        total += Number(round.playerResults?.[player.id]?.roundPoints) || 0;
        values.push(total);
      });
      return { player, originalIndex, values };
    });

    const width = 720;
    const height = 340;
    const margin = { top: 24, right: 62, bottom: 50, left: 24 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const allValues = series.flatMap(({ values }) => values);
    const { minimum, maximum, ticks } = getScoreProgressScale(allValues);
    const pointCount = Math.max(rounds.length, 1);
    const getX = (index) => margin.left + (index / pointCount) * plotWidth;
    const getY = (value) => margin.top + ((maximum - value) / (maximum - minimum)) * plotHeight;

    const svg = createSvgElement("svg");
    svg.classList.add("score-progress-svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    const titleId = `${container.id}-svg-title`;
    const descriptionId = `${container.id}-svg-description`;
    svg.setAttribute("aria-labelledby", `${titleId} ${descriptionId}`);

    const title = createSvgElement("title");
    title.id = titleId;
    title.textContent = "Score progression by round";
    const description = createSvgElement("desc");
    description.id = descriptionId;
    description.textContent = "Cumulative scores for every player, starting at zero before the first round.";
    svg.append(title, description);

    ticks.forEach((tick) => {
      const y = getY(tick);
      const line = createSvgElement("line");
      line.classList.add("score-progress-grid-line");
      line.setAttribute("x1", String(margin.left));
      line.setAttribute("x2", String(width - margin.right));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));

      const label = createSvgElement("text");
      label.classList.add("score-progress-axis-label", "score-progress-y-label");
      const labelX = width - margin.right + 12;
      label.setAttribute("x", String(labelX));
      label.setAttribute("y", String(y));
      label.setAttribute("aria-label", Formatters.formatNumber(tick));

      const sign = createSvgElement("tspan");
      sign.classList.add("score-progress-y-sign");
      sign.setAttribute("x", String(labelX));
      sign.textContent = tick < 0 ? "\u2212" : "";
      sign.setAttribute("aria-hidden", "true");

      const magnitude = createSvgElement("tspan");
      magnitude.classList.add("score-progress-y-magnitude");
      magnitude.setAttribute("x", String(labelX + 14));
      magnitude.textContent = String(Math.abs(tick));
      magnitude.setAttribute("aria-hidden", "true");
      label.append(sign, magnitude);
      svg.append(line, label);
    });

    const xAxisLabels = [{ index: 0, label: "0" }];
    const labelStep = Math.max(1, Math.ceil(rounds.length / 6));
    rounds.forEach((round, index) => {
      const isLastRound = index === rounds.length - 1;
      if ((index + 1) % labelStep === 0 || isLastRound) {
        xAxisLabels.push({ index: index + 1, label: String(round.number) });
      }
    });
    xAxisLabels.forEach(({ index, label: text }) => {
      const label = createSvgElement("text");
      label.classList.add("score-progress-axis-label", "score-progress-x-label");
      label.setAttribute("x", String(getX(index)));
      label.setAttribute("y", String(height - 20));
      label.textContent = text;
      svg.append(label);
    });

    series.forEach(({ player, originalIndex, values }) => {
      const line = createSvgElement("polyline");
      line.classList.add("score-progress-line");
      line.dataset.playerColor = String(originalIndex + 1);
      line.setAttribute("points", values.map((value, index) => `${getX(index)},${getY(value)}`).join(" "));
      line.setAttribute("aria-label", Formatters.getPlayerDisplayName(gameState, player.id, originalIndex));
      svg.append(line);

      const endpoint = createSvgElement("circle");
      endpoint.classList.add("score-progress-endpoint");
      endpoint.dataset.playerColor = String(originalIndex + 1);
      endpoint.setAttribute("cx", String(getX(values.length - 1)));
      endpoint.setAttribute("cy", String(getY(values.at(-1))));
      endpoint.setAttribute("r", "4");
      endpoint.setAttribute("aria-hidden", "true");
      svg.append(endpoint);
    });

    const legend = document.createElement("div");
    legend.className = "score-progress-legend";
    legend.setAttribute("aria-label", "Players");
    series.forEach(({ player, originalIndex }) => {
      const item = document.createElement("span");
      item.className = "score-progress-legend-item";
      item.dataset.playerColor = String(originalIndex + 1);

      const marker = document.createElement("span");
      marker.className = "score-progress-legend-marker";
      marker.setAttribute("aria-hidden", "true");

      const name = document.createElement("span");
      name.textContent = Formatters.getPlayerDisplayName(gameState, player.id, originalIndex);
      item.append(marker, name);
      legend.append(item);
    });

    container.append(svg, legend);
  }

  function getScoreProgressScale(values) {
    const rawMinimum = Math.min(0, ...values);
    const rawMaximum = Math.max(0, ...values);
    const rawRange = Math.max(rawMaximum - rawMinimum, 1);
    const roughStep = rawRange / 4;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalized = roughStep / magnitude;
    const stepMultiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    const step = stepMultiplier * magnitude;
    let minimum = Math.floor(rawMinimum / step) * step;
    let maximum = Math.ceil(rawMaximum / step) * step;
    if (minimum === maximum) {
      minimum -= step;
      maximum += step;
    }

    const ticks = [];
    for (let value = minimum; value <= maximum + step / 2; value += step) {
      ticks.push(Object.is(value, -0) ? 0 : value);
    }
    return { minimum, maximum, ticks };
  }

  function createSvgElement(tagName) {
    return document.createElementNS(SVG_NAMESPACE, tagName);
  }

  function getRankedPlayers(gameState, totals) {
    // Seat order is a deterministic layout tie-breaker; it does not change tied players' rank.
    return gameState.players
      .map((player, originalIndex) => ({
        player,
        originalIndex,
        points: Number(totals[player.id]) || 0
      }))
      .sort((a, b) => b.points - a.points || a.originalIndex - b.originalIndex);
  }

  root.WizardResultView = Object.freeze({
    renderRanking,
    renderScoreHistory,
    renderScoreProgress
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
