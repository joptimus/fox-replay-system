"""
F1 Race Replay Launcher
Modern F1.com inspired design with official F1 branding and aesthetic
"""

import customtkinter as ctk
from tkinter import messagebox
import threading
import subprocess
import sys
import fastf1
from src.f1_data import enable_cache

# Set appearance mode
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("dark-blue")


class F1LauncherApp:
    # F1 Official Color Scheme (from formula1.com)
    BG_MAIN = "#0f0f10"  # F1 official dark background
    BG_SECONDARY = "#1a1a1a"  # Slightly lighter
    F1_RED = "#e10600"  # Official F1 red
    F1_ACCENT = "#1f1f1f"  # Card backgrounds
    TEXT_PRIMARY = "#ffffff"
    TEXT_SECONDARY = "#888888"
    TEXT_MUTED = "#555555"

    def __init__(self, root):
        self.root = root
        self.root.title("F1 Race Replay")
        self.root.geometry("900x750")
        self.root.minsize(800, 650)
        self.root.resizable(True, True)
        self.root.configure(fg_color=self.BG_MAIN)

        # Disable antialiasing for better performance
        try:
            self.root.attributes("-noactivate", True)
        except:
            pass

        self.setup_ui()
        self.load_years()

    def setup_ui(self):
        """Create F1.com inspired modern UI"""
        # Disable update during setup for better performance
        self.root.update_idletasks()

        # Main container
        main_frame = ctk.CTkFrame(self.root, fg_color=self.BG_MAIN, corner_radius=0)
        main_frame.pack(fill=ctk.BOTH, expand=True)

        # Top navigation bar (like F1.com)
        nav_frame = ctk.CTkFrame(main_frame, fg_color=self.BG_SECONDARY, height=70, corner_radius=0)
        nav_frame.pack(fill=ctk.X, padx=0, pady=0)
        nav_frame.pack_propagate(False)

        # F1 Logo area (left side)
        logo_label = ctk.CTkLabel(
            nav_frame,
            text="F1",
            font=("Titillium Web", 28, "bold"),
            text_color=self.F1_RED
        )
        logo_label.pack(side=ctk.LEFT, padx=30, pady=20)

        # Navigation title
        nav_title = ctk.CTkLabel(
            nav_frame,
            text="RACE REPLAY",
            font=("Titillium Web", 12),
            text_color=self.TEXT_SECONDARY
        )
        nav_title.pack(side=ctk.LEFT, padx=15, pady=20)

        # Hero section with gradient effect
        hero_frame = ctk.CTkFrame(main_frame, fg_color=self.F1_ACCENT, corner_radius=0, height=160)
        hero_frame.pack(fill=ctk.X, padx=0, pady=0)
        hero_frame.pack_propagate(False)

        # Hero content
        hero_content = ctk.CTkFrame(hero_frame, fg_color=self.F1_ACCENT, corner_radius=0)
        hero_content.pack(fill=ctk.BOTH, expand=True, padx=40, pady=30)

        # Main title
        title = ctk.CTkLabel(
            hero_content,
            text="SELECT YOUR RACE",
            font=("Titillium Web", 40, "bold"),
            text_color=self.F1_RED
        )
        title.pack(anchor="w", pady=(0, 10))

        # Subtitle
        subtitle = ctk.CTkLabel(
            hero_content,
            text="Choose a season and round to replay the action",
            font=("Titillium Web", 11),
            text_color=self.TEXT_SECONDARY
        )
        subtitle.pack(anchor="w")

        # Content section
        content_frame = ctk.CTkFrame(main_frame, fg_color=self.BG_MAIN, corner_radius=0)
        content_frame.pack(fill=ctk.BOTH, expand=True, padx=40, pady=40)

        # Create a grid-like layout (two columns)
        left_column = ctk.CTkFrame(content_frame, fg_color=self.BG_MAIN)
        left_column.pack(side=ctk.LEFT, fill=ctk.BOTH, expand=True, padx=(0, 20))

        right_column = ctk.CTkFrame(content_frame, fg_color=self.BG_MAIN)
        right_column.pack(side=ctk.RIGHT, fill=ctk.BOTH, expand=True, padx=(20, 0))

        # LEFT COLUMN - RACE SELECTION
        left_label = ctk.CTkLabel(
            left_column,
            text="RACE SELECTION",
            font=("Titillium Web", 14, "bold"),
            text_color=self.F1_RED
        )
        left_label.pack(anchor="w", pady=(0, 30))

        # Season section
        self._create_form_group(left_column, "Season")
        self.year_var = ctk.StringVar()
        self.year_dropdown = self._create_styled_combobox(
            left_column,
            self.year_var,
            []
        )
        self.year_dropdown.pack(fill=ctk.X, pady=(0, 25))
        self.year_dropdown.bind("<<ComboboxSelected>>", self._on_year_selected)

        # Round section
        self._create_form_group(left_column, "Round")
        self.round_var = ctk.StringVar()
        self.round_dropdown = self._create_styled_combobox(
            left_column,
            self.round_var,
            []
        )
        self.round_dropdown.pack(fill=ctk.X, pady=(0, 30))
        self.round_dropdown.bind("<<ComboboxSelected>>", self._on_round_selected)
        self.round_dropdown.bind("<Return>", self._on_round_selected)

        # RIGHT COLUMN - SESSION & OPTIONS
        right_label = ctk.CTkLabel(
            right_column,
            text="SESSION DETAILS",
            font=("Titillium Web", 14, "bold"),
            text_color=self.F1_RED
        )
        right_label.pack(anchor="w", pady=(0, 30))

        # Session type section with card style
        session_card = ctk.CTkFrame(right_column, fg_color=self.F1_ACCENT, corner_radius=8)
        session_card.pack(fill=ctk.X, pady=(0, 25))

        session_label = ctk.CTkLabel(
            session_card,
            text="Session Type",
            font=("Titillium Web", 11),
            text_color=self.TEXT_SECONDARY
        )
        session_label.pack(anchor="w", padx=15, pady=(15, 10))

        self.session_var = ctk.StringVar(value="R")

        options = [
            ("Race", "R"),
            ("Sprint", "S"),
            ("Qualifying", "Q"),
            ("Sprint Qualifying", "SQ")
        ]

        for text, value in options:
            radio_btn = ctk.CTkRadioButton(
                session_card,
                text=text,
                variable=self.session_var,
                value=value,
                fg_color=self.F1_RED,
                hover_color="#cc0500",
                border_color=self.F1_RED,
                text_color=self.TEXT_PRIMARY,
                font=("Titillium Web", 11)
            )
            radio_btn.pack(anchor="w", padx=15, pady=5)

        padding = ctk.CTkLabel(session_card, text="", fg_color=self.F1_ACCENT)
        padding.pack(pady=5)

        # Advanced options card
        advanced_card = ctk.CTkFrame(right_column, fg_color=self.F1_ACCENT, corner_radius=8)
        advanced_card.pack(fill=ctk.X)

        advanced_label = ctk.CTkLabel(
            advanced_card,
            text="Advanced Options",
            font=("Titillium Web", 11),
            text_color=self.TEXT_SECONDARY
        )
        advanced_label.pack(anchor="w", padx=15, pady=(15, 10))

        self.refresh_var = ctk.BooleanVar(value=False)
        refresh_checkbox = ctk.CTkCheckBox(
            advanced_card,
            text="Force refresh telemetry",
            variable=self.refresh_var,
            fg_color=self.F1_RED,
            hover_color="#cc0500",
            border_color=self.F1_RED,
            text_color=self.TEXT_PRIMARY,
            font=("Titillium Web", 11)
        )
        refresh_checkbox.pack(anchor="w", padx=15, pady=(0, 15))

        # Bottom action section
        bottom_frame = ctk.CTkFrame(main_frame, fg_color=self.BG_MAIN)
        bottom_frame.pack(fill=ctk.X, padx=40, pady=(0, 40))

        # Launch button (full width, prominent)
        self.launch_btn = ctk.CTkButton(
            bottom_frame,
            text="LAUNCH REPLAY",
            command=self._launch_replay,
            fg_color=self.F1_RED,
            hover_color="#cc0500",
            text_color=self.TEXT_PRIMARY,
            font=("Titillium Web", 14, "bold"),
            corner_radius=8,
            height=55,
            border_width=0
        )
        self.launch_btn.pack(fill=ctk.X, pady=(0, 15))

        # Status label
        self.status_label = ctk.CTkLabel(
            bottom_frame,
            text="Ready to launch",
            font=("Titillium Web", 10),
            text_color=self.TEXT_MUTED
        )
        self.status_label.pack(anchor="w")

    def _create_form_group(self, parent, label):
        """Create a form group label"""
        label_widget = ctk.CTkLabel(
            parent,
            text=label.upper(),
            font=("Titillium Web", 11),
            text_color=self.TEXT_SECONDARY
        )
        label_widget.pack(anchor="w", pady=(15, 8))

    def _create_styled_combobox(self, parent, variable, values):
        """Create a styled combobox matching F1.com design"""
        return ctk.CTkComboBox(
            parent,
            variable=variable,
            state="readonly",
            values=values,
            fg_color=self.F1_ACCENT,
            bg_color=self.BG_MAIN,
            button_color=self.F1_RED,
            button_hover_color="#cc0500",
            border_color=self.F1_RED,
            border_width=2,
            text_color=self.TEXT_PRIMARY,
            dropdown_fg_color=self.F1_ACCENT,
            dropdown_text_color=self.TEXT_PRIMARY,
            corner_radius=6,
            font=("Titillium Web", 11),
            height=40
        )

    def load_years(self):
        """Load available years"""
        try:
            self.status_label.configure(text="Loading seasons...", text_color="#ffaa00")
            self.root.update()

            years = [str(year) for year in range(2025, 2017, -1)]
            self.year_dropdown.configure(values=years)
            if years:
                self.year_dropdown.set(years[0])
                self._on_year_selected()
            self.status_label.configure(text="Ready to launch", text_color=self.TEXT_MUTED)
        except Exception as e:
            messagebox.showerror("Error", f"Failed to load seasons: {str(e)}")
            self.status_label.configure(text="Error loading data", text_color=self.F1_RED)

    def _on_year_selected(self, event=None):
        """Load rounds for selected year"""
        try:
            year = int(self.year_var.get())
            enable_cache()
            schedule = fastf1.get_event_schedule(year)
            rounds = [f"{int(row['RoundNumber'])} - {row['EventName']}" for _, row in schedule.iterrows()]

            self.round_dropdown.configure(values=rounds)
            if rounds:
                self.round_dropdown.set(rounds[0])
            self.status_label.configure(text="Ready to launch", text_color=self.TEXT_MUTED)
        except Exception as e:
            messagebox.showerror("Error", f"Failed to load rounds: {str(e)}")
            self.status_label.configure(text="Error loading rounds", text_color=self.F1_RED)

    def _on_round_selected(self, event=None):
        """Update status when round is selected"""
        self.status_label.configure(text="Ready to launch", text_color=self.TEXT_MUTED)

    def _launch_replay(self):
        """Launch the race replay"""
        if not self.year_var.get() or not self.round_var.get():
            messagebox.showwarning("Missing Selection", "Please select both season and round")
            return

        try:
            year = int(self.year_var.get())
            round_str = self.round_var.get().split(' - ')[0]
            round_number = int(round_str)
            session_type = self.session_var.get()

            self.status_label.configure(
                text="Loading telemetry data (this may take a minute)...",
                text_color="#ffaa00"
            )
            self.launch_btn.configure(state="disabled")
            self.root.update()

            # Start loading in background thread
            thread = threading.Thread(
                target=self._load_telemetry,
                args=(year, round_number, session_type),
                daemon=False
            )
            thread.start()

        except Exception as e:
            messagebox.showerror("Error", f"Failed to launch replay: {str(e)}")
            self.status_label.configure(text="Error", text_color=self.F1_RED)
            self.launch_btn.configure(state="normal")

    def _load_telemetry(self, year, round_number, session_type):
        """Load telemetry and launch replay in subprocess"""
        try:
            # Launch the replay in a separate process
            # This avoids all threading issues with pyglet/arcade
            cmd = [
                sys.executable,
                "main.py",
                "--year", str(year),
                "--round", str(round_number)
            ]

            # Add session type flag
            if session_type == "S":
                cmd.append("--sprint")
            elif session_type == "Q":
                cmd.append("--qualifying")
            elif session_type == "SQ":
                cmd.append("--sprint-qualifying")
            # Default is race (no flag needed)

            # Close the launcher window
            self.root.after(0, self.root.quit)

            # Launch subprocess (will run on its own process with its own main thread)
            subprocess.Popen(cmd)

        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror("Error", f"Failed to run replay: {str(e)}"))


if __name__ == "__main__":
    enable_cache()
    root = ctk.CTk()
    app = F1LauncherApp(root)
    root.mainloop()
