import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	ItemView,
	ViewStateResult,
} from "obsidian";

// View type for the sidebar heatmap
const ZONE_TIME_VIEW_TYPE = "zone-time-view";

interface ZoneTimeSettings {
	studyTimes: Record<string, number>; // Format: { "YYYY-MM-DD": minutes }
}

const DEFAULT_SETTINGS: ZoneTimeSettings = {
	studyTimes: {},
};

export default class ZoneTimePlugin extends Plugin {
	settings: ZoneTimeSettings;

	async onload() {
		await this.loadSettings();

		// Register the view type
		this.registerView(
			ZONE_TIME_VIEW_TYPE,
			(leaf) => new ZoneTimeView(leaf, this)
		);

		// Add ribbon icon for opening the study time input modal
		this.addRibbonIcon("clock", "Record Zone Time", (evt: MouseEvent) => {
			new ZoneTimeInputModal(this.app, this).open();
		});

		// Add a command to show the study time heatmap in sidebar
		this.addCommand({
			id: "show-zone-time-heatmap",
			name: "Show Heatmap",
			callback: () => {
				this.activateView();
			},
		});

		// Add another command to record study time
		this.addCommand({
			id: "record-zone-time",
			name: "Record Time",
			callback: () => {
				new ZoneTimeInputModal(this.app, this).open();
			},
		});

		// Add settings tab
		this.addSettingTab(new ZoneTimeSettingTab(this.app, this));

		// Activate view when plugin loads
		this.app.workspace.onLayoutReady(() => this.activateView());
	}

	async onunload() {
		// Remove the detachLeavesOfType call as it's an antipattern
		// Let Obsidian handle the view lifecycle
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	getFormattedDate(date: Date): string {
		return date.toISOString().slice(0, 10); // Format: YYYY-MM-DD
	}

	// Record study time for a specific date
	async recordZoneTime(date: Date, minutes: number) {
		const dateStr = this.getFormattedDate(date);
		if (minutes > 0) {
			this.settings.studyTimes[dateStr] = minutes;
			new Notice(
				`Recorded ${minutes} minutes of zone time for ${dateStr}`
			);
		} else {
			// If minutes is 0 or less, remove the entry for that date
			if (this.settings.studyTimes.hasOwnProperty(dateStr)) {
				delete this.settings.studyTimes[dateStr];
				new Notice(`Cleared zone time for ${dateStr}`);
			} else {
				// No existing record to clear, and input is 0 - do nothing or provide a gentle notice
				new Notice(`No zone time to clear for ${dateStr}`);
			}
		}
		await this.saveSettings();

		// Refresh the view if it's open
		this.refreshView();
	}

	// Get study time for a specific date
	getZoneTime(date: Date): number {
		const dateStr = this.getFormattedDate(date);
		return this.settings.studyTimes[dateStr] || 0;
	}

	// Activate the heatmap view in the sidebar
	async activateView() {
		const { workspace } = this.app;

		// Check if view is already open
		const existingLeaves = workspace.getLeavesOfType(ZONE_TIME_VIEW_TYPE);
		if (existingLeaves.length > 0) {
			workspace.revealLeaf(existingLeaves[0]);
			return;
		}

		// Create a new leaf in the right sidebar
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: ZONE_TIME_VIEW_TYPE,
				active: true,
			});

			workspace.revealLeaf(leaf);
		}
	}

	// Refresh the heatmap view if it's open
	refreshView() {
		const leaves = this.app.workspace.getLeavesOfType(ZONE_TIME_VIEW_TYPE);
		if (leaves.length > 0) {
			const view = leaves[0].view as ZoneTimeView;
			view.refresh();
		}
	}
}

class ZoneTimeInputModal extends Modal {
	plugin: ZoneTimePlugin;
	date: Date;
	minutes: number;

	constructor(app: App, plugin: ZoneTimePlugin, initialMinutes?: number) {
		super(app);
		this.plugin = plugin;
		this.date = new Date();
		this.minutes = initialMinutes || 0;
	}

	// Method to allow pre-filling the date
	setDate(date: Date): ZoneTimeInputModal {
		this.date = date;
		return this; // Allow chaining
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: "Record Zone Time" });

		// Date selector
		new Setting(contentEl).setName("Date").addText((text) =>
			text
				.setValue(this.plugin.getFormattedDate(this.date))
				.onChange((value) => {
					try {
						this.date = new Date(value);
					} catch (e) {
						// Invalid date, keep current value
					}
				})
		);

		// Minutes input
		new Setting(contentEl).setName("Zone Time (minutes)").addText((text) =>
			text
				.setValue(this.minutes > 0 ? this.minutes.toString() : "")
				.onChange((value) => {
					if (value.trim() === "") {
						this.minutes = 0;
					} else {
						const parsed = parseInt(value);
						if (!isNaN(parsed) && parsed >= 0) {
							this.minutes = parsed;
						} else if (isNaN(parsed)) {
							this.minutes = 0;
						}
					}
				})
		);

		// Save button
		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Save")
				.setCta()
				.onClick(async () => {
					// Allow saving if minutes is 0 (to clear the record) or a positive number.
					// The check for this.minutes being a valid number (not NaN) is implicitly handled by prior onChange.
					if (this.minutes >= 0) {
						await this.plugin.recordZoneTime(
							this.date,
							this.minutes // This could be 0
						);
						this.close();
					} else {
						// This case should ideally not be reached if onChange correctly sets minutes to 0 for invalid/empty inputs.
						new Notice(
							"Please enter a valid number of minutes (0 or more)"
						);
					}
				})
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Create a sidebar view for the heatmap
class ZoneTimeView extends ItemView {
	plugin: ZoneTimePlugin;
	selectedYear: number;
	selectedMonth: number;
	tooltipEl: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: ZoneTimePlugin) {
		super(leaf);
		this.plugin = plugin;
		const today = new Date();
		this.selectedYear = today.getFullYear();
		this.selectedMonth = today.getMonth();
		// Create tooltip element once
		this.tooltipEl = document.createElement("div");
		this.tooltipEl.addClass("heatmap-tooltip");
		document.body.appendChild(this.tooltipEl); // Append to body to avoid clipping
	}

	getViewType(): string {
		return ZONE_TIME_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Zone Time";
	}

	getIcon(): string {
		return "calendar-with-checkmark";
	}

	async onOpen(): Promise<void> {
		this.refresh();
	}

	async onunload() {
		// Clean up tooltip when view is closed
		if (this.tooltipEl) {
			this.tooltipEl.remove();
		}
	}

	refresh(): void {
		const { contentEl } = this;
		contentEl.empty();

		const viewContainer = contentEl.createDiv("zone-time-view-container");

		// Create summary container above the heatmap
		const summaryContainer = viewContainer.createDiv(
			"zone-time-summary-container"
		);
		// This will create the text part of the summary (e.g., "1 hour this month")
		this.displaySelectedPeriodInfo(
			summaryContainer,
			this.selectedYear,
			this.selectedMonth
		);
		// This will create the new <input type="month"> and append it to summaryContainer
		this.createYearMonthInputControl(summaryContainer);

		// Heatmap container - Placed before header controls now
		const heatmapContainer = viewContainer.createDiv("heatmap-container");
		const heatmapGridContainer = heatmapContainer.createDiv(
			"heatmap-grid-new-orientation"
		);

		this.generateHeatmap(
			heatmapGridContainer,
			this.selectedYear,
			this.selectedMonth
		);

		// Header controls: Info, Year/Month selector, Record button - Moved to the bottom
		const headerControls = viewContainer.createDiv(
			"zone-time-header-controls"
		);
		// Summary info is no longer displayed here
		// this.displaySelectedPeriodInfo(
		// 	headerControls,
		// 	this.selectedYear,
		// 	this.selectedMonth
		// );

		// The createMonthYearSelector is now called within refresh method,
		// and appends the control to summaryContainer.
		// The headerControls at the bottom will now only manage the Record button.

		const recordButton = headerControls.createEl("button", {
			text: "Record",
			cls: "mod-cta zone-time-record-button",
		});
		recordButton.addEventListener("click", () => {
			new ZoneTimeInputModal(this.app, this.plugin).open();
		});
	}

	displaySelectedPeriodInfo(
		containerEl: HTMLElement, // This will now be the summaryContainer
		year: number,
		month: number
	) {
		let totalMinutes = 0;
		const firstDayOfMonth = new Date(year, month, 1);
		const lastDayOfMonth = new Date(year, month + 1, 0);

		for (
			let d = new Date(firstDayOfMonth);
			d <= lastDayOfMonth;
			d.setDate(d.getDate() + 1)
		) {
			totalMinutes += this.plugin.getZoneTime(new Date(d));
		}

		let timeString = "";
		if (totalMinutes >= 60) {
			const hours = Math.floor(totalMinutes / 60);
			const minutes = totalMinutes % 60;
			if (minutes === 0) {
				timeString = `${hours} hr${hours > 1 ? "s" : ""}`;
			} else {
				timeString = `${hours} hr${
					hours > 1 ? "s" : ""
				} ${minutes} min`;
			}
		} else {
			// For 0 minutes, display "0 min" for clarity, or we could show nothing.
			// Let's stick to "0 min" for consistency for now.
			timeString = `${totalMinutes} min`;
		}

		const monthName = firstDayOfMonth.toLocaleString("default", {
			month: "long",
		});

		let textContent = `${timeString} in ${monthName} ${year}`;

		const today = new Date();
		if (year === today.getFullYear() && month === today.getMonth()) {
			textContent = `${timeString} this month`;
		}

		// Ensure the info element exists or create it within the containerEl
		let infoEl = containerEl.querySelector<HTMLElement>(
			".zone-time-period-info"
		);
		if (!infoEl) {
			// No longer prepending, just creating as a direct child of summaryContainer
			infoEl = containerEl.createDiv({ cls: "zone-time-period-info" });
		}
		infoEl.textContent = textContent;
		infoEl.removeClass("zone-time-week-info");
		infoEl.addClass("zone-time-period-info");
	}

	calculateCurrentWeekMinutes(): number {
		const today = new Date();
		const currentDay = today.getDay(); // 0 for Sunday, 1 for Monday, ...
		// Calculate the first day of the current week (Sunday)
		const firstDayOfWeek = new Date(today);
		firstDayOfWeek.setDate(today.getDate() - currentDay);
		firstDayOfWeek.setHours(0, 0, 0, 0); // Set to the beginning of the day

		let totalMinutes = 0;
		for (let i = 0; i < 7; i++) {
			const dayInWeek = new Date(firstDayOfWeek);
			dayInWeek.setDate(firstDayOfWeek.getDate() + i);
			totalMinutes += this.plugin.getZoneTime(dayInWeek);
		}
		return totalMinutes;
	}

	// Renamed and refactored to use input type="month"
	createYearMonthInputControl(container: HTMLElement) {
		// container is expected to be summaryContainer, which is a flex container

		const yearMonthInput = container.createEl("input", {
			type: "month",
			cls: "year-month-input", // Add a class for styling
		});

		// Set initial value
		const initialYear = this.selectedYear;
		const initialMonth = this.selectedMonth + 1; // Convert 0-indexed to 1-indexed for YYYY-MM format
		yearMonthInput.value = `${initialYear}-${initialMonth
			.toString()
			.padStart(2, "0")}`;

		// Potentially set min/max based on getAvailableYears logic if desired
		// For example, to limit future selections, or very old years.
		// const availableYears = this.getAvailableYears();
		// if (availableYears.length > 0) {
		// 	yearMonthInput.min = `${Math.min(...availableYears)}-01`;
		// 	yearMonthInput.max = `${Math.max(...availableYears)}-12`;
		// }

		yearMonthInput.addEventListener("change", (event) => {
			const value = (event.target as HTMLInputElement).value;
			if (value) {
				const [yearStr, monthStr] = value.split("-");
				this.selectedYear = parseInt(yearStr, 10);
				this.selectedMonth = parseInt(monthStr, 10) - 1; // Convert back to 0-indexed
				this.refresh();
			}
		});
	}

	generateHeatmap(container: HTMLElement, year: number, month: number) {
		container.empty(); // Clear previous heatmap

		// 1. Create Day Headers (Sun, Mon, ..., Sat) - This structure remains similar
		const daysHeaderRow = container.createDiv("heatmap-days-header-row");
		// For a monthly view, the corner spacer for month labels is not needed.
		// We might need a different spacer or styling if month names are displayed elsewhere.
		// For now, let's remove it or make it conditional if side month labels are truly gone.
		// daysHeaderRow.createDiv("heatmap-corner-spacer-new"); // Removed for pure monthly view

		const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		dayLabels.forEach((day) => {
			daysHeaderRow.createEl("div", {
				cls: "heatmap-day-top-label",
				text: day,
			});
		});

		// Main content area for cells (no separate month label column for monthly view)
		const cellsGridContainer = container.createDiv(
			"heatmap-cells-grid-new-orientation" // This class might need review if layout changes significantly
		);

		const weeksData = this.generateWeeksData(year, month);

		if (weeksData.length === 0) {
			cellsGridContainer.setText(
				`No data to display for ${new Date(year, month).toLocaleString(
					"default",
					{ month: "long" }
				)} ${year}.`
			);
			return;
		}

		weeksData.forEach((week) => {
			const weekRowEl = cellsGridContainer.createDiv(
				"heatmap-week-row-new"
			);
			week.days.forEach((dateObj) => {
				if (dateObj) {
					// Ensure dateObj is for the currently selected month before processing
					if (
						dateObj.getFullYear() === year &&
						dateObj.getMonth() === month
					) {
						const zoneTime = this.plugin.getZoneTime(dateObj);
						const intensity = this.getIntensityClass(zoneTime);
						const cell = weekRowEl.createEl("div", {
							cls: `heatmap-cell intensity-${intensity} has-tooltip`,
							attr: {
								"data-date":
									this.plugin.getFormattedDate(dateObj),
							},
						});
						const formattedDate =
							this.formatDateForDisplay(dateObj);
						const tooltipText =
							zoneTime > 0
								? `${zoneTime} minutes on ${formattedDate}`
								: `No zone time on ${formattedDate}`;
						cell.setAttribute("data-tooltip", tooltipText);
						cell.addEventListener("mouseenter", (e) =>
							this.showTooltip(e)
						);
						cell.addEventListener("mouseleave", () =>
							this.hideTooltip()
						);
						cell.addEventListener("click", () => {
							new ZoneTimeInputModal(
								this.app,
								this.plugin,
								zoneTime // Pass existing zoneTime as initialMinutes
							)
								.setDate(dateObj) // Pre-fill date
								.open();
						});
					} else {
						// This cell is padding from an adjacent month, render as placeholder
						weekRowEl.createEl("div", {
							cls: "heatmap-cell-placeholder",
						});
					}
				} else {
					// This is a null placeholder from generateWeeksData (should also be a placeholder)
					weekRowEl.createEl("div", {
						cls: "heatmap-cell-placeholder",
					});
				}
			});
		});

		// Legend (can remain, it's generic)
		const legendContainer = container.createDiv({ cls: "heatmap-legend" });
		legendContainer.createEl("span", { text: "Less" });
		for (let i = 0; i <= 4; i++) {
			legendContainer.createEl("div", {
				cls: `legend-cell intensity-${i}`,
			});
		}
		legendContainer.createEl("span", { text: "More" });
	}

	showTooltip(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target || !target.hasAttribute("data-tooltip")) return;
		const text = target.getAttribute("data-tooltip");
		if (!text) return;

		this.tooltipEl.textContent = text;
		this.tooltipEl.addClass("visible");
		this.tooltipEl.removeClass("tooltip-below");

		const rect = target.getBoundingClientRect();
		const tooltipRect = this.tooltipEl.getBoundingClientRect();

		let top = rect.top - tooltipRect.height - 10;
		let left = rect.left + rect.width / 2 - tooltipRect.width / 2;

		if (top < 10) {
			top = rect.bottom + 10;
			this.tooltipEl.addClass("tooltip-below");
			this.tooltipEl.setAttribute("data-position", "bottom");
		} else {
			this.tooltipEl.setAttribute("data-position", "top");
		}

		if (left < 10) left = 10;
		if (left + tooltipRect.width > window.innerWidth - 10) {
			left = window.innerWidth - tooltipRect.width - 10;
		}

		// Use CSS custom properties with semantic names for positioning
		this.tooltipEl.style.setProperty("--heatmap-tooltip-top", `${top}px`);
		this.tooltipEl.style.setProperty("--heatmap-tooltip-left", `${left}px`);
	}

	hideTooltip() {
		this.tooltipEl.removeClass("visible");
		this.tooltipEl.removeAttribute("data-position");
	}

	// generateWeeksData is now adjusted for monthly view
	generateWeeksData(
		year: number,
		month: number
	): { days: (Date | null)[]; weekStart: Date }[] {
		const weeks: { days: (Date | null)[]; weekStart: Date }[] = [];
		const firstDayOfMonth = new Date(year, month, 1);
		const lastDayOfMonth = new Date(year, month + 1, 0);

		// Adjust startDate to be the first Sunday of the week containing the firstDayOfMonth
		let currentDay = new Date(firstDayOfMonth);
		currentDay.setDate(currentDay.getDate() - currentDay.getDay()); // Rewind to Sunday

		while (currentDay <= lastDayOfMonth || weeks.length < 6) {
			// Ensure we show at least some full weeks, up to 6 for monthly view
			const week: { days: (Date | null)[]; weekStart: Date } = {
				days: [],
				weekStart: new Date(currentDay),
			};
			for (let i = 0; i < 7; i++) {
				// Only include days that are within the selected month
				if (
					currentDay.getMonth() === month &&
					currentDay.getFullYear() === year
				) {
					week.days.push(new Date(currentDay));
				} else {
					week.days.push(null); // Placeholder for days outside the month
				}
				currentDay.setDate(currentDay.getDate() + 1);
			}
			weeks.push(week);
			if (
				currentDay.getMonth() !== month &&
				weeks.length >= 4 &&
				week.days.every((d) => d === null || d.getMonth() !== month)
			) {
				// If we've passed the end of the month and have at least 4 weeks,
				// and the current week being processed is entirely outside the target month, stop.
				// This prevents adding many empty weeks if the month ends early in a week.
				// We need to check if *all* days in the *last added* week are outside the month to break.
				const lastAddedWeek = weeks[weeks.length - 1];
				if (
					lastAddedWeek.days.every(
						(d) => d === null || d.getMonth() !== month
					)
				) {
					// If the last week we just pushed is entirely for the next month (or previous), remove it and break.
					// This can happen if the month ends on a Saturday, for instance.
					if (
						lastAddedWeek.days.some(
							(d) =>
								d !== null &&
								d.getMonth() === month &&
								d.getFullYear() === year
						)
					) {
						// Keep it if it has any day from the current month
					} else {
						weeks.pop();
						break;
					}
				}
			}
			// Safety break to avoid infinite loops if month is very short / logic error
			if (weeks.length > 6) break;
		}
		return weeks;
	}

	formatDateForDisplay(date: Date): string {
		return date.toLocaleDateString("default", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	}

	getIntensityClass(minutes: number): number {
		if (minutes === 0) return 0;
		if (minutes < 30) return 1;
		if (minutes < 60) return 2;
		if (minutes < 120) return 3;
		return 4;
	}
}

class ZoneTimeSettingTab extends PluginSettingTab {
	plugin: ZoneTimePlugin;

	constructor(app: App, plugin: ZoneTimePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Zone Time Settings" });

		new Setting(containerEl)
			.setName("Zone Time Data")
			.setDesc("View or clear your recorded zone time data")
			.addButton((button) =>
				button
					.setButtonText("Clear All Data")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.studyTimes = {};
						await this.plugin.saveSettings();
						new Notice("All zone time data has been cleared");
						this.plugin.refreshView();
						this.display();
					})
			);

		// Display study time data summary
		const studyTimes = this.plugin.settings.studyTimes;
		const entries = Object.entries(studyTimes);

		if (entries.length > 0) {
			containerEl.createEl("h3", { text: "Recent Entries" });

			// Sort by date (newest first)
			entries.sort((a, b) => b[0].localeCompare(a[0]));

			// Show last 10 entries
			const recentEntries = entries.slice(0, 10);

			const dataContainer = containerEl.createDiv("zone-time-data");

			recentEntries.forEach(([date, minutes]) => {
				new Setting(dataContainer)
					.setName(date)
					.setDesc(`${minutes} minutes`)
					.addButton((button) =>
						button
							.setIcon("trash")
							.setTooltip("Delete entry")
							.onClick(async () => {
								delete this.plugin.settings.studyTimes[date];
								await this.plugin.saveSettings();
								this.plugin.refreshView();
								this.display();
							})
					);
			});
		}
	}
}
