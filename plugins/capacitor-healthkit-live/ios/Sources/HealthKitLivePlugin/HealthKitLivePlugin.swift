import Foundation
import Capacitor
import HealthKit

@objc(HealthKitLivePlugin)
public class HealthKitLivePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitLivePlugin"
    public let jsName = "HealthKitLive"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentHeartRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startHeartRateMonitoring", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopHeartRateMonitoring", returnType: CAPPluginReturnPromise)
    ]

    private static let heartRateUnit: HKUnit = HKUnit.count().unitDivided(by: HKUnit.minute())

    private let healthStore = HKHealthStore()
    private var anchoredQuery: HKAnchoredObjectQuery?
    private var queryAnchor: HKQueryAnchor?

    private var heartRateType: HKQuantityType? {
        HKQuantityType.quantityType(forIdentifier: .heartRate)
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false])
            return
        }
        guard let hrType = heartRateType else {
            call.reject("Heart rate type unavailable on this device")
            return
        }
        healthStore.requestAuthorization(toShare: nil, read: [hrType]) { success, error in
            if let error = error {
                call.reject("Authorization failed: \(error.localizedDescription)")
                return
            }
            call.resolve(["granted": success])
        }
    }

    @objc func getCurrentHeartRate(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let hrType = heartRateType else {
            call.resolve(["bpm": NSNull(), "timestamp": NSNull()])
            return
        }

        let endDate = Date()
        let startDate = endDate.addingTimeInterval(-2 * 60)
        let predicate = HKQuery.predicateForSamples(
            withStart: startDate,
            end: endDate,
            options: .strictEndDate
        )
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

        let query = HKSampleQuery(
            sampleType: hrType,
            predicate: predicate,
            limit: 1,
            sortDescriptors: [sortDescriptor]
        ) { _, samples, error in
            if let error = error {
                call.reject("Heart rate query failed: \(error.localizedDescription)")
                return
            }
            guard let sample = samples?.first as? HKQuantitySample else {
                call.resolve(["bpm": NSNull(), "timestamp": NSNull()])
                return
            }
            let bpm = sample.quantity.doubleValue(for: HealthKitLivePlugin.heartRateUnit)
            call.resolve([
                "bpm": Int(bpm.rounded()),
                "timestamp": HealthKitLivePlugin.iso8601(sample.endDate)
            ])
        }
        healthStore.execute(query)
    }

    @objc func startHeartRateMonitoring(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let hrType = heartRateType else {
            call.reject("HealthKit unavailable")
            return
        }

        if let existing = anchoredQuery {
            healthStore.stop(existing)
            anchoredQuery = nil
        }
        queryAnchor = nil

        let predicate = HKQuery.predicateForSamples(
            withStart: Date(),
            end: nil,
            options: .strictStartDate
        )
        let query = HKAnchoredObjectQuery(
            type: hrType,
            predicate: predicate,
            anchor: queryAnchor,
            limit: HKObjectQueryNoLimit
        ) { [weak self] _, samples, _, newAnchor, _ in
            self?.queryAnchor = newAnchor
            self?.handleHeartRateSamples(samples)
        }
        query.updateHandler = { [weak self] _, samples, _, newAnchor, _ in
            self?.queryAnchor = newAnchor
            self?.handleHeartRateSamples(samples)
        }

        anchoredQuery = query
        healthStore.execute(query)
        call.resolve()
    }

    @objc func stopHeartRateMonitoring(_ call: CAPPluginCall) {
        if let existing = anchoredQuery {
            healthStore.stop(existing)
            anchoredQuery = nil
        }
        queryAnchor = nil
        call.resolve()
    }

    private func handleHeartRateSamples(_ samples: [HKSample]?) {
        guard let quantitySamples = samples as? [HKQuantitySample], !quantitySamples.isEmpty else {
            return
        }
        for sample in quantitySamples {
            let bpm = sample.quantity.doubleValue(for: HealthKitLivePlugin.heartRateUnit)
            notifyListeners("heartRateUpdate", data: [
                "bpm": Int(bpm.rounded()),
                "timestamp": HealthKitLivePlugin.iso8601(sample.endDate)
            ])
        }
    }

    private static func iso8601(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}
