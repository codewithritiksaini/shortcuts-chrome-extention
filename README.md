# 🚀 Shortcut Helper - Text Expansion Chrome Extension

<div align="center">

[![GitHub License](https://img.shields.io/github/license/codewithritiksaini/shortcuts-chrome-extention)](https://github.com/codewithritiksaini/shortcuts-chrome-extention/blob/main/LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/codewithritiksaini/shortcuts-chrome-extention)](https://github.com/codewithritiksaini/shortcuts-chrome-extention/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/codewithritiksaini/shortcuts-chrome-extention)](https://github.com/codewithritiksaini/shortcuts-chrome-extention/issues)
[![Contact](https://img.shields.io/badge/Contact-ritiksaini.in/contact--us-blue)](https://ritiksaini.in/contact-us)

</div>

<div align="center">
  <img src="https://shortcut-helper.ritiksaini.in/image/extension.png" alt="Shortcut Helper Demo" height="450"><br><br><br>
  
  **Type Less, Do More!** ✨
  
  [Website](https://shortcut-helper.ritiksaini.in) | 
  [Report Bug](https://ritiksaini.in/contact-us) | 
  [Request Feature](https://ritiksaini.in/contact-us)
</div>


## ✨ Features

### 🚀 Core Features
- **⚡ Instant Text Expansion**: Type shortcuts that expand into full text with Tab key
- **🔒 100% Offline & Private**: All data stored locally in your browser
- **🔄 GitHub Sync**: Optional sync with private GitHub repositories
- **😊 Smart Emoji Support**: Add emojis and random selection with `:count` syntax
- **🌐 Universal Compatibility**: Works on Gmail, WhatsApp Web, Slack, Docs, Forms, and more!

### 🛡 Security Features
- **Zero Data Collection**: No tracking, no analytics, no external servers
- **Local Storage**: All shortcuts stored in your browser only
- **Secure GitHub Sync**: Uses personal access tokens with repo scope only
- **Open Source**: Transparent code you can review and audit

### 🎯 Productivity Boosters
- **Custom Shortcuts**: Create unlimited personalized shortcuts
- **Import/Export**: Backup and restore your shortcuts
- **Bulk Operations**: Manage multiple shortcuts efficiently
- **Cross-Device Sync**: Access shortcuts on all your devices

### 🚀 Basic Installation (1 Minute)

``` bash
# Clone the repository
git clone https://github.com/codewithritiksaini/shortcuts-chrome-extention.git
```

**Or download ZIP:** 
1. Click **Code** → **Download ZIP** 
2. Extract the folder

**Then in Chrome:** 
1. Open `chrome://extensions/` 
2. Enable **Developer mode** (top-right) 
3. Click **Load unpacked** 4. Select the extracted folder

✅ **Done!** 🎉 Shortcut Helper is now installed.

``` bash
git clone https://github.com/codewithritiksaini/shortcuts-chrome-extention.git
```
<details>
<summary><b>📥 Option B: Download ZIP</b></summary>

<br>

1. Go to the **GitHub Repository**  
2. Click the **Code** button (green)  
3. Select **Download ZIP**  
4. Extract the ZIP file to a folder  


</details>

<br>

<details>
<summary><b>🔧 Step 2: Enable Developer Mode</b></summary>

<br>

1. Open **Google Chrome**  
2. Navigate to `chrome://extensions/`  
3. Toggle **Developer mode** ON (top-right corner)  


</details>

<br>

<details>
<summary><b>📦 Step 3: Load the Extension</b></summary>

<br>

1. Click **Load unpacked**  
2. Browse and select the downloaded/extracted folder  
3. Click **Select Folder**  


Extension icon will appear in the Chrome toolbar.
</details>

#### ✅ Verification:
    Click the puzzle icon in the Chrome toolbar → Pin **Shortcut Helper**



## 🔧 Usage

### Creating Your First Shortcut

1. Click the **Shortcut Helper** icon in the Chrome toolbar  
2. Click **Add New Shortcut**
3. Enter the following details:

   **Shortcut:**
``` /gm ```

&nbsp; **Expanded Text:**
``` Good morning! Hope you're having a great day. ```


4. Click **Save**

---

### Using Shortcuts

You can use shortcuts **anywhere you can type text**:

1. Type your shortcut (e.g., `/gm`)
2. Press the **Tab** key
3. Watch it expand instantly! 🎯

### 📌 Example Shortcuts

#### 🔹 Basic Shortcuts

    "/gm"      → "Good morning! Hope you're having a productive day."
    "/sig"     → "Best regards, John Doe Senior Developer"  
    "/phone"   → "+1 (123) 456-7890"
    "/address" → "123 Main St, City, Country 12345"

😊 With Emojis

 ```"/thanks:3" → "Thank you so much! 🙏👍😊" ```   
 ```"/happy"    → "I'm so happy!" ```

 #### 👨‍💻 For Developers


    "/reactcomp" → "import React from 'react';

    const Component = () => {
    return (
        <div>
        {/* Your code here */}
        </div>
    );
    };

    export default Component;"

    "/usestate" → "const [state, setState] = useState(initialValue);"

    "/axiosget" → "axios.get(url)
    .then(response => {
        console.log(response.data);
    })
    .catch(error => {
        console.error(error);
    });"

## 🚀 Advanced Features

### 😊 Emoji Support

    "/celebrate" → "Congratulations! 🎉🎊🥳"
    "/love:2"    → "I love this! ❤️💖"   // Random selection from 2 options
## 🔐 GitHub Sync Setup

### 🤔 Why Use GitHub Sync?

- 🔄 **Automatic Backup** – Never lose your shortcuts  
- 📱 **Cross-Device Access** – Use shortcuts on multiple computers  
- 🕐 **Version History** – Track changes over time  
- 🔒 **Secure Storage** – Stored safely in your private GitHub repository  

---

### ⚙️ Setup Instructions

<details>
<summary><b>📁 Step 1: Create Private Repository</b></summary><br>

1. Go to **GitHub**
2. Click **New repository**
3. Repository name: `my-shortcuts-backup`
4. ⚠️ **IMPORTANT:** Set repository to **Private**
5. Click **Create repository**

</details>

<br>

<details>
<summary><b>🔑 Step 2: Generate Access Token</b></summary><br>


1. Go to **GitHub → Settings**
2. Open **Developer settings**
3. Click **Personal access tokens**
4. Select **Generate new token (classic)**
5. Note: `Shortcut Helper Sync`
6. Select scope: **repo** (Full control of private repositories)
7. Click **Generate token**

⚠️ **IMPORTANT:** Copy the token immediately — you won’t be able to see it again!

</details>

<br>

<details>

<summary><b>⚙️ Step 3: Configure Extension</b></summary><br>

1. Open **Shortcut Helper** extension settings
2. Find **GitHub Sync** section
3. Enter the following details:

   - **Username:** Your GitHub username  
   - **Repository:** `my-shortcuts-backup`  
   - **Token:** Paste your copied access token  

4. Click **Enable Sync**

✅ On first sync, a file named `shortcuts-backup.json` will be created in your repository.

</details>

---

### 🔄 Sync Features

- ⏱ **Auto-sync:** Every 5 minutes  
- 🔘 **Manual Sync:** Click the sync button anytime  
- ⚔️ **Conflict Resolution:** Local data takes priority  
- 🗂 **Version Control:** Full GitHub commit history available  

## 🛠 Development

### 📁 Project Structure


    shortcuts-chrome-extention/
    ├── manifest.json          # Extension configuration
    ├── popup.html             # Extension popup UI
    ├── popup.js               # Popup functionality
    ├── background.js          # Background service worker
    ├── content.js             # Content script for web pages
    ├── settings.html          # Settings page
    ├── settings.js            # Settings functionality
    ├── styles.css             # Global styles
    ├── icons/                 # Extension icons
    │   ├── icon16.png
    │   ├── icon48.png
    │   └── icon128.png
    └── README.md              # This file
## 🏗️ Building from Source


    # Clone repository
    git clone https://github.com/codewithritiksaini/shortcuts-chrome-extention.git

    # Navigate to directory
    cd shortcuts-chrome-extention

    # Install dependencies (if any)
    # Currently pure JavaScript - no dependencies!

    # Load in Chrome as described above
## ⚙️ Technical Details

- **Manifest Version:** V3 (latest Chrome extension standard)  
- **Languages:** Pure JavaScript (no frameworks)  
- **Storage:** Chrome Storage API + GitHub API (for sync)  
- **Permissions:** Minimum required for functionality  

## 🔐 Required Permissions
    {
    "storage": "Store shortcuts locally",
    "activeTab": "Access current tab for text expansion",
    "scripting": "Inject expansion functionality",
    "host_permissions": "Work on all websites"
    }
## 🤝 Contributing

We love contributions! Here’s how you can help 🚀

### 💡 Ways to Contribute

- 🐞 **Report Bugs** – Create an issue  
- 💭 **Suggest Features** – Share your ideas  
- 📝 **Improve Documentation** – Fix typos, add examples  
- 💻 **Submit Code** – Pull requests are welcome!  

## 🔁 Development Workflow

1. Fork the repository  
2. Create a feature branch  
3. Make your changes  
4. Test thoroughly  
5. Submit a pull request  

## 🧑‍💻 Coding Standards

- Use meaningful variable names  
- Add comments for complex logic  
- Follow existing code style  
- Test on multiple websites  

## 📄 License

This project is licensed under the MIT License — see the `LICENSE` file for details.

* MIT License   

    #### Copyright© 2025 Ritik Saini

    <div style="text-align: justify;" >
        Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:<br><br>
        The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
    
    </div>


---

## 📞 Contact

### 👤 Project Maintainer  
**Ritik Saini**

- 🌐 **Portfolio:** [ritiksaini.in](https://ritiksaini.in)  
- 📧 **Email:** contact.ritiksaini@gmail.com  
- 🐦 **GitHub:** [@codewithritiksaini](https://github.com/codewithritiksaini)  
- 💼 **LinkedIn:** [Ritik Saini](https://www.linkedin.com/in/ritik-saini-web-developer/)

---

## 🔗 Project Links

- 🌍 **Live Website:** https://shortcut-helper.ritiksaini.in  
- 📦 **GitHub Repo:** https://github.com/codewithritiksaini/shortcuts-chrome-extention  
- 🐛 **Issue Tracker:** https://ritiksaini.in/contact-us  &nbsp;  _(or email: contact.ritiksaini@gmail.com)_

## 🆘 Support

- ❓ **Questions:** https://ritiksaini.in/contact-us
- 🐛 **Bug Reports:** https://ritiksaini.in/contact-us  &nbsp;  _(or email: contact.ritiksaini@gmail.com)_  
- 💡 **Feature Requests:** We'd love to hear your ideas!  
- ⭐ **Like this project?** Star the repository!

<div align="center"><br>

### ⭐ Star This Repository

If you find **Shortcut Helper** useful, please consider giving it a star on GitHub!  
It helps more people discover this tool.

<div align="center">

### 📈 Real-time Statistics

## ![GitHub Stats](https://github-star-history.ritiksaini.in/card.svg)

</div>

<br>

### 📢 Spread the Word

Share **Shortcut Helper** with your friends and colleagues!

</div>

<br>

<div align="center">

Check out **Shortcut Helper** – an amazing text expansion Chrome extension!  
🔗 [GitHub Repository](https://github.com/codewithritiksaini/shortcuts-chrome-extention)  

Happy Typing! 🚀✨  
Save time, reduce repetitive strain, and boost your productivity with **Shortcut Helper**!

</div>

