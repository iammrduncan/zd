// The desktop wrapper has no console window in a Windows release build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    zd_lib::run_desktop()
}
