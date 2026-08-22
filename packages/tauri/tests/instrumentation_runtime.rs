use zd_lib::instrumentation::{CurrentProcessSampler, ProcessSampler};

#[test]
fn the_production_sampler_reports_only_bounded_current_process_metrics() {
    let sampler = CurrentProcessSampler::new().expect("the current process has a native identity");

    let first = sampler
        .sample()
        .expect("the current process can be sampled");
    let second = sampler
        .sample()
        .expect("the current process remains sampleable");

    assert!(first.cpu_percent.is_finite());
    assert!((0.0..=10_000.0).contains(&first.cpu_percent));
    assert!(first.resident_bytes > 0);
    assert!(second.cpu_percent.is_finite());
    assert!(second.resident_bytes > 0);
}
