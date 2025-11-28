# ScoreSync

## Local Deployment

To switch from the browser environment to a local deployment, follow these steps:

1. **Install Dependencies**
   Run the following command to install the required packages:
   ```bash
   npm install
   ```

2. **Configure Vite Entry Point**
   Ensure your `index.html` file includes the entry point for the React application. Add the following script tag inside the `<body>` (or `<head>`):
   ```html
   <script type="module" src="/index.tsx"></script>
   ```

3. **Run Development Server**
   Start the application locally:
   ```bash
   npm run dev
   ```
