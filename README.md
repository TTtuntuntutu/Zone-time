# Zone Time

An Obsidian plugin to track your daily zone time with a GitHub-like contribution heatmap.

## Features

-   Track your daily zone time with a simple input interface
-   Visualize your zone time history with a GitHub-like contribution heatmap
-   The more zone time you log each day, the greener the cells become
-   View and manage your zone time records in the settings
-   Supports both light and dark modes
-   Select specific years to view your heatmap
-   Displays total zone time for the current week

## How to Use

1.  Click the clock icon in the left ribbon or use the command "Show Zone Time Heatmap" to open the view.
2.  Use the year selector at the top to choose the desired year.
3.  Click the "Record Zone Time" button to enter your zone time in minutes for a selected date.
4.  View your zone time activity on the heatmap.
5.  See the total minutes for the current week displayed at the top left.
6.  Manage your zone time records in the plugin settings.

## Installation

### From Obsidian

1.  Open Obsidian Settings
2.  Go to Community Plugins and turn off Restricted Mode
3.  Click Browse and search for "Zone Time"
4.  Install the plugin and enable it

### Manual Installation

1.  Download the latest release from GitHub.
2.  Extract the zip file into your Obsidian vault's `.obsidian/plugins` folder (e.g., `VaultFolder/.obsidian/plugins/zone-time/`).
3.  Enable the plugin in Obsidian settings.

## Development

This plugin is built using the Obsidian Plugin API and TypeScript.

### Setup

```bash
# Clone this repository
git clone https://github.com/yourusername/obsidian-zone-time.git

# Navigate into the project
cd obsidian-zone-time

# Install dependencies
yarn install

# Build the plugin
yarn build
```

### Watch Mode

```bash
yarn dev
```

This will automatically recompile the plugin when you make changes to the source files.

## License

[MIT](LICENSE)
