"""
Driver Card Designer Playground
Interactive tool to design and preview driver info cards
"""

import pygame
import os
from PIL import Image
import io

# Initialize Pygame
pygame.init()
pygame.font.init()

# Screen settings
WIDTH = 1200
HEIGHT = 800
FPS = 60

# Colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
DARK_GRAY = (30, 30, 30)
LIGHT_GRAY = (150, 150, 150)
RED_BULL = (30, 80, 150)  # Red Bull Blue
MERCEDES = (0, 210, 190)  # Mercedes Teal
FERRARI = (220, 0, 0)     # Ferrari Red
MCLAREN = (255, 135, 0)   # McLaren Orange

TEAM_COLORS = {
    'RBR': RED_BULL,
    'Mercedes': MERCEDES,
    'Ferrari': FERRARI,
    'McLaren': MCLAREN,
}

class DriverCardDesigner:
    def __init__(self):
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("Driver Card Designer")
        self.clock = pygame.time.Clock()
        self.running = True

        # Card settings (editable)
        self.card_width = 300
        self.card_height = 500
        self.card_x = 100
        self.card_y = 50

        # Photo settings
        self.photo_height = 200
        self.photo_padding = 0

        # Current driver
        self.current_driver = 'VER'
        self.current_team_color = RED_BULL

        # Load a sample driver image
        self.driver_image = None
        self.load_driver_image()

        # UI state
        self.selected_param = None
        self.info_bg_darkness = 30  # Darkness of info section background (0-100)
        self.params = {
            'card_width': ('Card Width', 200, 500, self.card_width),
            'card_height': ('Card Height', 300, 700, self.card_height),
            'photo_height': ('Photo Height', 100, 400, self.photo_height),
            'photo_padding': ('Photo Padding', 0, 50, self.photo_padding),
        }

        # Font
        self.font_large = pygame.font.Font(None, 28)
        self.font_medium = pygame.font.Font(None, 24)
        self.font_small = pygame.font.Font(None, 16)

    def load_driver_image(self):
        """Load and crop a sample driver image"""
        drivers_folder = os.path.join("images", "drivers", "2025")
        driver_file = os.path.join(drivers_folder, f"{self.current_driver}.avif")

        if os.path.exists(driver_file):
            try:
                img = Image.open(driver_file)
                width_px, height_px = img.size

                # Crop to top 20% (head and shoulders)
                crop_box = (0, 0, width_px, int(height_px * 0.20))
                cropped = img.crop(crop_box)

                # Convert to pygame surface
                img_bytes = io.BytesIO()
                cropped.save(img_bytes, format='PNG')
                img_bytes.seek(0)

                self.driver_image = pygame.image.load(img_bytes)
                print(f"Loaded {self.current_driver} image: {self.driver_image.get_size()}")
            except Exception as e:
                print(f"Error loading image: {e}")
                self.driver_image = None
        else:
            print(f"Driver image not found: {driver_file}")
            self.driver_image = None

    def draw_card(self):
        """Draw the driver card with F1-style layout"""
        # Card background - Team color
        card_rect = pygame.Rect(self.card_x, self.card_y, self.card_width, self.card_height)
        pygame.draw.rect(self.screen, self.current_team_color, card_rect)
        pygame.draw.rect(self.screen, WHITE, card_rect, 3)  # Border

        # ===== TOP SECTION: Driver Info Card (Team Color Background) =====
        top_section_height = self.photo_height
        top_section_y = self.card_y

        # Left side: Driver info (text)
        left_col_width = int(self.card_width * 0.5)  # 50% for text
        info_x = self.card_x + 15
        info_y = top_section_y + 15

        # Driver name (larger)
        name_text = self.font_large.render("Max", True, WHITE)
        self.screen.blit(name_text, (info_x, info_y))

        # Driver surname (larger, bold-ish with rendering)
        surname_text = self.font_large.render("Verstappen", True, WHITE)
        self.screen.blit(surname_text, (info_x, info_y + 30))

        # Team name (smaller)
        team_text = self.font_small.render("Red Bull Racing", True, WHITE)
        self.screen.blit(team_text, (info_x, info_y + 65))

        # Driver number (very large)
        number_font = pygame.font.Font(None, 60)
        number_text = number_font.render("1", True, WHITE)
        self.screen.blit(number_text, (info_x, info_y + 85))

        # Right side: Driver photo
        photo_x = self.card_x + left_col_width + 10
        photo_width = int(self.card_width * 0.45)

        if self.driver_image:
            photo_rect = pygame.Rect(photo_x, top_section_y, photo_width, top_section_height)
            scaled_img = pygame.transform.scale(self.driver_image, (photo_width, top_section_height))
            self.screen.blit(scaled_img, photo_rect)

        # ===== BOTTOM SECTION: Telemetry (Dark Background) =====
        bottom_section_y = top_section_y + top_section_height
        bottom_section_height = self.card_height - top_section_height
        bottom_bg_rect = pygame.Rect(self.card_x, bottom_section_y, self.card_width, bottom_section_height)
        pygame.draw.rect(self.screen, DARK_GRAY, bottom_bg_rect)

        # Telemetry data
        telemetry_y = bottom_section_y + 15

        # Speed
        speed_label = self.font_small.render("Speed", True, LIGHT_GRAY)
        self.screen.blit(speed_label, (self.card_x + 20, telemetry_y))

        speed_value = self.font_medium.render("160 km/h", True, WHITE)
        self.screen.blit(speed_value, (self.card_x + 20, telemetry_y + 20))

        # Gear
        gear_label = self.font_small.render("Gear", True, LIGHT_GRAY)
        self.screen.blit(gear_label, (self.card_x + 20, telemetry_y + 50))

        gear_value = self.font_medium.render("4", True, WHITE)
        self.screen.blit(gear_value, (self.card_x + 20, telemetry_y + 70))

        # Throttle/Brake bars
        bar_x = self.card_x + self.card_width - 80
        throttle_rect = pygame.Rect(bar_x - 30, telemetry_y + 10, 20, 80)
        brake_rect = pygame.Rect(bar_x + 10, telemetry_y + 10, 20, 80)

        pygame.draw.rect(self.screen, (50, 50, 50), throttle_rect)
        pygame.draw.rect(self.screen, (50, 50, 50), brake_rect)

        # Throttle fill
        throttle_fill = pygame.Rect(bar_x - 30, telemetry_y + 10 + 80 - int(80 * 0.6), 20, int(80 * 0.6))
        pygame.draw.rect(self.screen, (0, 200, 100), throttle_fill)

        # Brake fill
        brake_fill = pygame.Rect(bar_x + 10, telemetry_y + 10 + 80 - int(80 * 0.3), 20, int(80 * 0.3))
        pygame.draw.rect(self.screen, (220, 50, 50), brake_fill)

        # Labels
        thr_label = self.font_small.render("THR", True, LIGHT_GRAY)
        brk_label = self.font_small.render("BRK", True, LIGHT_GRAY)
        self.screen.blit(thr_label, (bar_x - 35, telemetry_y + 100))
        self.screen.blit(brk_label, (bar_x + 5, telemetry_y + 100))

    def draw_ui(self):
        """Draw control panel"""
        panel_x = self.card_x + self.card_width + 150
        panel_y = 50

        # Title
        title = self.font_large.render("Card Settings", True, WHITE)
        self.screen.blit(title, (panel_x, panel_y))

        # Parameters
        param_y = panel_y + 50
        for i, (key, (label, min_val, max_val, current_val)) in enumerate(self.params.items()):
            y = param_y + i * 80

            # Label
            label_text = self.font_medium.render(f"{label}:", True, WHITE)
            self.screen.blit(label_text, (panel_x, y))

            # Value display
            value_text = self.font_small.render(f"{int(current_val)}", True, LIGHT_GRAY)
            self.screen.blit(value_text, (panel_x, y + 25))

            # Slider background
            slider_rect = pygame.Rect(panel_x, y + 45, 200, 10)
            pygame.draw.rect(self.screen, (50, 50, 50), slider_rect)
            pygame.draw.rect(self.screen, LIGHT_GRAY, slider_rect, 1)

            # Slider fill
            range_val = max_val - min_val
            fill_width = (current_val - min_val) / range_val * 200
            fill_rect = pygame.Rect(panel_x, y + 45, fill_width, 10)
            pygame.draw.rect(self.screen, self.current_team_color, fill_rect)

            # Instructions
            self.params[key] = (label, min_val, max_val, current_val)

        # Driver selection
        driver_y = param_y + len(self.params) * 80 + 20
        driver_label = self.font_medium.render("Current Driver:", True, WHITE)
        self.screen.blit(driver_label, (panel_x, driver_y))

        driver_text = self.font_medium.render(self.current_driver, True, self.current_team_color)
        self.screen.blit(driver_text, (panel_x, driver_y + 35))

        # Instructions
        inst_y = driver_y + 100
        instructions = [
            "← → : Change driver",
            "↑ ↓ : Adjust selected param",
            "Click slider to adjust",
            "1-4 : Select parameter",
            "ESC : Exit"
        ]
        for i, inst in enumerate(instructions):
            inst_text = self.font_small.render(inst, True, LIGHT_GRAY)
            self.screen.blit(inst_text, (panel_x, inst_y + i * 25))

    def handle_input(self):
        """Handle keyboard input"""
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False

            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    self.running = False

                # Driver selection
                elif event.key == pygame.K_LEFT:
                    drivers = ['VER', 'LEC', 'SAI', 'HAM', 'RUS', 'NOR']
                    idx = drivers.index(self.current_driver) if self.current_driver in drivers else 0
                    idx = (idx - 1) % len(drivers)
                    self.current_driver = drivers[idx]
                    self.load_driver_image()

                elif event.key == pygame.K_RIGHT:
                    drivers = ['VER', 'LEC', 'SAI', 'HAM', 'RUS', 'NOR']
                    idx = drivers.index(self.current_driver) if self.current_driver in drivers else 0
                    idx = (idx + 1) % len(drivers)
                    self.current_driver = drivers[idx]
                    self.load_driver_image()

                # Parameter selection (1-4)
                elif event.key in [pygame.K_1, pygame.K_2, pygame.K_3, pygame.K_4]:
                    param_keys = list(self.params.keys())
                    idx = [pygame.K_1, pygame.K_2, pygame.K_3, pygame.K_4].index(event.key)
                    if idx < len(param_keys):
                        self.selected_param = param_keys[idx]

                # Adjust selected parameter
                elif event.key == pygame.K_UP and self.selected_param:
                    label, min_val, max_val, current = self.params[self.selected_param]
                    current = min(max_val, current + 5)
                    self.params[self.selected_param] = (label, min_val, max_val, current)
                    self._update_param()

                elif event.key == pygame.K_DOWN and self.selected_param:
                    label, min_val, max_val, current = self.params[self.selected_param]
                    current = max(min_val, current - 5)
                    self.params[self.selected_param] = (label, min_val, max_val, current)
                    self._update_param()

            elif event.type == pygame.MOUSEBUTTONDOWN:
                # Handle slider clicks
                panel_x = self.card_x + self.card_width + 150
                param_y = 100

                for i, key in enumerate(self.params.keys()):
                    y = param_y + i * 80
                    slider_rect = pygame.Rect(panel_x, y + 45, 200, 10)

                    if slider_rect.collidepoint(event.pos):
                        label, min_val, max_val, _ = self.params[key]
                        # Calculate value from mouse position
                        relative_x = event.pos[0] - slider_rect.x
                        percentage = max(0, min(1, relative_x / slider_rect.width))
                        new_val = min_val + (max_val - min_val) * percentage
                        self.params[key] = (label, min_val, max_val, new_val)
                        self._update_param()
                        self.selected_param = key

    def _update_param(self):
        """Update card parameters from self.params"""
        self.card_width = int(self.params['card_width'][3])
        self.card_height = int(self.params['card_height'][3])
        self.photo_height = int(self.params['photo_height'][3])
        self.photo_padding = int(self.params['photo_padding'][3])

    def run(self):
        """Main loop"""
        while self.running:
            self.handle_input()

            # Draw
            self.screen.fill(BLACK)
            self.draw_card()
            self.draw_ui()

            # FPS counter
            fps_text = self.font_small.render(f"FPS: {int(self.clock.get_fps())}", True, LIGHT_GRAY)
            self.screen.blit(fps_text, (10, 10))

            pygame.display.flip()
            self.clock.tick(FPS)

        pygame.quit()

if __name__ == "__main__":
    designer = DriverCardDesigner()
    designer.run()
